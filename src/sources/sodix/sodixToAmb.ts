/**
 * SODIX API v3 → AMB.
 *
 * SODIX (https://sodix.de) is the German federal-state media platform for
 * educational resources. Its GraphQL API v3 serves ~200k records whose shape
 * predates AMB, so this adapter is a genuine mapping rather than a renaming.
 *
 * Design rules:
 *  - AMB core fields are only populated where the semantics actually hold.
 *  - Every lossy mapping additionally emits the SODIX original into the `ext`
 *    namespace, so no value is silently dropped.
 *  - SODIX-internal bookkeeping (recordStatus, tenantRecordStatus) is a
 *    selection criterion for the caller, not content — only recordStatus is
 *    carried, as provenance.
 */

import type { AmbLearningResource, Concept, Person, Organization } from '../../types/amb.js';
import type {
  SodixRecord,
  SodixTerm,
  SodixToAmbOptions,
  SodixToAmbResult,
} from './types.js';
import {
  EDUCATIONAL_LEVELS,
  LANGUAGES,
  LANGUAGE_MARKERS,
  LEARNING_RESOURCE_TYPES,
  SUBJECTS,
  durationToIso8601,
  normalizeLicenseUrl,
  toIsoDate,
  type KimConcept,
} from './vocab.js';

/** Reverse-DNS namespace, as NIP-AMB recommends for new authorities. */
export const SODIX_EXT_NAMESPACE = 'de.sodix';

const AMB_CONTEXT = ['https://w3id.org/kim/amb/context.jsonld', { '@language': 'de' }];

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function terms(value: SodixTerm[] | null | undefined): SodixTerm[] {
  return Array.isArray(value) ? value.filter((entry): entry is SodixTerm => Boolean(entry)) : [];
}

function strings(value: (string | null)[] | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(clean).filter((entry): entry is string => entry !== null);
}

/** Concept from a KIM entry — the label is authoritative German. */
function kimConcept(entry: KimConcept): Concept {
  return { id: entry.id, type: 'Concept', prefLabel: { de: entry.de } };
}

function dedupeById(concepts: Concept[]): Concept[] {
  return [...new Map(concepts.map((concept) => [concept.id, concept])).values()];
}

/**
 * Language each SODIX vocabulary serves its names in — checked against the
 * live dictionary. `null` means the language is not reliably determinable, in
 * which case no `prefLabel` is claimed and only the SODIX key survives as `id`.
 */
const EXT_LABEL_LANG: Readonly<Record<string, string | null>> = {
  ressourcentyp: 'en',
  bildungsstufe: 'en',
  schulform: 'en',
  klassenstufe: 'en',
  kostenstatus: 'en',
  ausbildungsjahr: 'en',
  ausbildungsart: 'en',
  ausbildungsbereich: 'en',
  berufsschulkompetenz: 'en',
  beruflicherRessourcentyp: 'en',
  fsk: 'en',
  usk: 'en',
  fach: 'de',
  berufsfeld: 'de',
  kompetenz: 'de',
  bundesland: null, // mixed within the same list
  lernfeld: null, // purely numeric ("1", "2", "3")
};

/** Collects `ext:<ns>:*` facets, discarding empty ones. */
class ExtCollector {
  private readonly facets: Record<string, Array<Concept | string>> = {};

  scalar(facet: string, value: unknown): void {
    const text = typeof value === 'boolean' ? String(value) : clean(value);
    if (text === null) return;
    (this.facets[facet] ??= []).push(text);
  }

  concept(facet: string, term: SodixTerm | null | undefined): void {
    const id = clean(term?.id);
    if (id === null) return;
    const lang = EXT_LABEL_LANG[facet] ?? null;
    const label = clean(term?.name);
    const concept: Concept = { id, type: 'Concept' };
    if (label !== null && lang !== null) concept.prefLabel = { [lang]: label };
    (this.facets[facet] ??= []).push(concept);
  }

  build(namespace: string): Record<string, Record<string, Array<Concept | string>>> | null {
    return Object.keys(this.facets).length > 0 ? { [namespace]: this.facets } : null;
  }
}

/** Derives the schema.org type from resource type and IANA media type. */
function deriveType(record: SodixRecord): string[] {
  const resourceTypes = terms(record.educational?.learningResourceType)
    .map((entry) => clean(entry.id))
    .filter((id): id is string => id !== null);
  const dataType = clean(record.media?.dataType) ?? '';
  const base = ['LearningResource'];

  if (resourceTypes.includes('KURS')) return [...base, 'Course'];
  if (resourceTypes.includes('PRESENTATION')) return [...base, 'PresentationDigitalDocument'];
  if (
    resourceTypes.some((type) => type === 'VIDEO' || type === 'AUDIOVISUELLES' || type === 'RADIO') ||
    dataType.startsWith('video/')
  ) {
    return [...base, 'VideoObject'];
  }
  if (resourceTypes.includes('AUDIO') || dataType.startsWith('audio/')) {
    return [...base, 'AudioObject'];
  }
  if (
    resourceTypes.some((type) => type === 'BILD' || type === 'POSTER' || type === 'INFOGRAFIK') ||
    dataType.startsWith('image/')
  ) {
    return [...base, 'ImageObject'];
  }
  return base;
}

const HUBBS_FACETS: ReadonlyArray<readonly [keyof NonNullable<SodixRecord['hubbs']>, string]> = [
  ['yearOfTraining', 'ausbildungsjahr'],
  ['occupationArea', 'berufsfeld'],
  ['learningField', 'lernfeld'],
  ['professionalLearningResourceType', 'beruflicherRessourcentyp'],
  ['vocationalTrainingArea', 'ausbildungsbereich'],
  ['typeOfTraining', 'ausbildungsart'],
  ['vocationalSchoolCompetency', 'berufsschulkompetenz'],
  ['federalState', 'bundesland'],
];

/**
 * Maps one SODIX record to AMB.
 *
 * Records without `sodixId` or without a title cannot be represented — AMB
 * requires `id` and `name` — and are reported rather than silently skipped.
 */
export function sodixToAmb(record: SodixRecord, options: SodixToAmbOptions = {}): SodixToAmbResult {
  const namespace = options.extNamespace ?? SODIX_EXT_NAMESPACE;
  const sodixId = clean(record.sodixId);
  if (sodixId === null) return { success: false, error: 'missing sodixId' };
  const name = clean(record.general?.title);
  if (name === null) return { success: false, error: 'missing title' };

  const id =
    options.idFor?.(sodixId, record) ??
    (options.idScheme === 'media' ? clean(record.media?.url) ?? `urn:sodix:${sodixId}` : `urn:sodix:${sodixId}`);

  const ext = new ExtCollector();
  // Built as a mutable bag and cast once at the end: AmbLearningResource is a
  // union whose members carry literal `type` tuples, which a runtime-derived
  // array cannot satisfy structurally.
  const amb: Record<string, unknown> = {
    '@context': AMB_CONTEXT,
    id,
    type: deriveType(record),
    name,
  };

  const description = clean(record.general?.description);
  if (description !== null) amb['description'] = description;

  const keywords = [...new Set(strings(record.general?.keywords))];
  if (keywords.length > 0) amb['keywords'] = keywords;

  // Real language codes go to inLanguage; version markers (AUDIO_DESCRIPTION,
  // PLAIN_LANGUAGE, …) are not languages and go to ext.
  const languages = new Set<string>();
  for (const entry of terms(record.general?.languages)) {
    const key = clean(entry.id);
    if (key === null) continue;
    if (LANGUAGE_MARKERS.has(key)) {
      ext.scalar('sprachfassung', entry.name ?? key);
      continue;
    }
    const code = LANGUAGES[key];
    if (code !== undefined) languages.add(code);
    else ext.scalar('sprache', entry.name ?? key);
  }
  if (languages.size > 0) amb['inLanguage'] = [...languages];

  // SODIX ships authors as free-text names and the producer as a company.
  const creators: Array<Person | Organization> = strings(record.lifeCycle?.author).map((author) => ({
    type: 'Person' as const,
    name: author,
  }));
  const producer = clean(record.lifeCycle?.producer);
  if (producer !== null) creators.push({ type: 'Organization', name: producer });
  if (creators.length > 0) amb['creator'] = creators;

  const sourceName = clean(record.source?.name);
  if (sourceName !== null) {
    const publisher: Organization = { type: 'Organization', name: sourceName };
    const website = clean(record.source?.website);
    if (website !== null && /^https?:\/\//i.test(website)) publisher.id = website;
    amb['publisher'] = [publisher];
  }

  const dateCreated = toIsoDate(record.createdAt);
  if (dateCreated !== null) amb['dateCreated'] = dateCreated;
  const datePublished = toIsoDate(record.lifeCycle?.publishedTime);
  if (datePublished !== null) amb['datePublished'] = datePublished;
  const dateModified = toIsoDate(record.updateTime);
  if (dateModified !== null) amb['dateModified'] = dateModified;

  // Only a real URI may become license.id. "Copyright, freier Zugang" is a
  // license *name*, not a URI, and would be a false statement there.
  const licenseUrl = normalizeLicenseUrl(record.rights?.license?.url);
  if (licenseUrl !== null) amb['license'] = { id: licenseUrl };
  const licenseName = clean(record.rights?.license?.name);
  if (licenseName !== null && licenseUrl === null) ext.scalar('lizenzname', licenseName);

  const paymentType = clean(record.paymentType);
  if (paymentType !== null) amb['isAccessibleForFree'] = paymentType === 'NOT_PAID';
  ext.concept('kostenstatus', record.rights?.cost);
  if (typeof record.rights?.downloadRight === 'boolean') {
    ext.scalar('downloadRecht', record.rights.downloadRight);
  }
  ext.scalar('lizenzhinweis', record.rights?.additionalLicenseInformation);

  const resourceTypeConcepts: Concept[] = [];
  for (const entry of terms(record.educational?.learningResourceType)) {
    const key = clean(entry.id);
    const target = key !== null ? LEARNING_RESOURCE_TYPES[key] : undefined;
    if (target !== undefined) resourceTypeConcepts.push(kimConcept(target));
    // Always retained: HCRT is coarser than the SODIX type list.
    ext.concept('ressourcentyp', entry);
  }
  if (resourceTypeConcepts.length > 0) {
    amb['learningResourceType'] = dedupeById(resourceTypeConcepts);
  }

  const levelConcepts: Concept[] = [];
  for (const entry of terms(record.educational?.educationalLevel)) {
    const key = clean(entry.id);
    const target = key !== null ? EDUCATIONAL_LEVELS[key] : undefined;
    if (target !== undefined) levelConcepts.push(kimConcept(target));
    else ext.concept('bildungsstufe', entry);
  }
  if (levelConcepts.length > 0) amb['educationalLevel'] = dedupeById(levelConcepts);

  const aboutConcepts: Concept[] = [];
  for (const entry of terms(record.educational?.subject)) {
    const key = clean(entry.id);
    const target = key !== null ? SUBJECTS[key] : undefined;
    if (target !== undefined) aboutConcepts.push(kimConcept(target));
    else ext.concept('fach', entry);
  }
  if (aboutConcepts.length > 0) amb['about'] = dedupeById(aboutConcepts);

  // Competences do NOT go to `teaches`: AMB requires a URI there, while SODIX
  // supplies internal numeric keys such as "40004020201".
  for (const entry of terms(record.educational?.competence)) ext.concept('kompetenz', entry);

  // `audience` denotes roles (learner/teacher), not school forms or grades,
  // so neither has an AMB core home.
  for (const entry of terms(record.educational?.schoolType)) ext.concept('schulform', entry);
  for (const entry of terms(record.educational?.classLevel)) ext.concept('klassenstufe', entry);
  ext.scalar('zielgruppe', record.educational?.targetAudience);

  const duration = durationToIso8601(record.media?.duration);
  if (duration !== null) amb['duration'] = duration;
  const thumbnail = clean(record.media?.thumbnail);
  if (thumbnail !== null) amb['image'] = thumbnail;

  const contentUrl = clean(record.media?.url);
  const dataType = clean(record.media?.dataType);
  const size = record.media?.size;
  const encoding: Record<string, string> = { type: 'MediaObject' };
  if (contentUrl !== null) encoding['contentUrl'] = contentUrl;
  if (dataType !== null) encoding['encodingFormat'] = dataType;
  if (size !== null && size !== undefined && String(size) !== '0') {
    encoding['contentSize'] = String(size);
  }
  if (Object.keys(encoding).length > 1) amb['encoding'] = [encoding];

  const downloadUrl = clean(record.media?.downloadUrl);
  if (downloadUrl !== null && downloadUrl !== contentUrl) ext.scalar('downloadUrl', downloadUrl);
  ext.scalar('originalUrl', record.media?.originalUrl);
  if (record.media?.video360Degrees === true) ext.scalar('video360', 'true');

  for (const [field, facet] of HUBBS_FACETS) {
    for (const entry of terms(record.hubbs?.[field] as SodixTerm[] | null | undefined)) {
      ext.concept(facet, entry);
    }
  }
  if (record.hubbs?.approvedByFederalState === true) ext.scalar('landesfreigabe', 'true');

  ext.scalar('originaltitel', record.paidMetadataInfo?.originalTitle);
  ext.scalar('serientitel', record.paidMetadataInfo?.seriesTitle);
  ext.scalar('verleih', record.paidMetadataInfo?.distributor);
  ext.scalar('didaktischeHinweise', record.paidMetadataInfo?.didacticalRemarks);
  for (const country of strings(record.paidMetadataInfo?.producerCountries)) {
    ext.scalar('produktionsland', country);
  }
  ext.concept('fsk', record.paidMetadataInfo?.fsk);
  ext.concept('usk', record.paidMetadataInfo?.usk);

  ext.scalar('sodixId', sodixId);
  ext.scalar('quelleId', record.source?.id);
  ext.scalar('datensatzstatus', record.recordStatus);

  const extObject = ext.build(namespace);
  if (extObject !== null) amb['ext'] = extObject;

  return { success: true, data: amb as unknown as AmbLearningResource };
}
