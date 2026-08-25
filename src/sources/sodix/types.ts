/**
 * SODIX API v3 record shapes.
 *
 * Only the fields the adapter reads are modelled. Everything is optional
 * because the API omits empty fields rather than nulling them, and record
 * completeness varies widely across the ~200k records in the corpus.
 *
 * @see https://fwu-de.atlassian.net/wiki/spaces/SXDOC/pages/966132836/Dokumentation+SODIX+API+v3
 */

/** A SODIX controlled-vocabulary entry. `id` is a SODIX enum key, not a URI. */
export interface SodixTerm {
  id?: string | null;
  name?: string | null;
  level?: number | null;
}

export interface SodixRecord {
  sodixId?: string | null;
  recordStatus?: string | null;
  tenantRecordStatus?: boolean | null;
  paymentType?: string | null;
  createdAt?: string | null;
  updateTime?: string | null;

  general?: {
    title?: string | null;
    description?: string | null;
    keywords?: (string | null)[] | null;
    languages?: SodixTerm[] | null;
  } | null;

  lifeCycle?: {
    author?: (string | null)[] | null;
    producer?: string | null;
    publishedTime?: string | null;
  } | null;

  source?: {
    id?: string | null;
    name?: string | null;
    website?: string | null;
  } | null;

  educational?: {
    targetAudience?: string | null;
    learningResourceType?: SodixTerm[] | null;
    educationalLevel?: SodixTerm[] | null;
    schoolType?: SodixTerm[] | null;
    classLevel?: SodixTerm[] | null;
    subject?: SodixTerm[] | null;
    competence?: SodixTerm[] | null;
  } | null;

  media?: {
    url?: string | null;
    downloadUrl?: string | null;
    originalUrl?: string | null;
    thumbnail?: string | null;
    duration?: string | null;
    dataType?: string | null;
    size?: string | number | null;
    video360Degrees?: boolean | null;
  } | null;

  rights?: {
    cost?: SodixTerm | null;
    license?: { name?: string | null; url?: string | null } | null;
    downloadRight?: boolean | null;
    additionalLicenseInformation?: string | null;
  } | null;

  /** Vocational education ("hochschulübergreifende berufsbildende Strukturen"). */
  hubbs?: {
    yearOfTraining?: SodixTerm[] | null;
    occupationArea?: SodixTerm[] | null;
    learningField?: SodixTerm[] | null;
    professionalLearningResourceType?: SodixTerm[] | null;
    vocationalTrainingArea?: SodixTerm[] | null;
    typeOfTraining?: SodixTerm[] | null;
    vocationalSchoolCompetency?: SodixTerm[] | null;
    federalState?: SodixTerm[] | null;
    approvedByFederalState?: boolean | null;
  } | null;

  paidMetadataInfo?: {
    originalTitle?: string | null;
    seriesTitle?: string | null;
    distributor?: string | null;
    didacticalRemarks?: string | null;
    producerCountries?: (string | null)[] | null;
    fsk?: SodixTerm | null;
    usk?: SodixTerm | null;
  } | null;
}

/** Result of mapping one record. Unmappable records are reported, not thrown. */
export type SodixToAmbResult =
  | { success: true; data: import('../../types/amb.js').AmbLearningResource }
  | { success: false; error: string };

/** How the AMB `id` (and therefore the Nostr `d` tag) is derived. */
export type SodixIdScheme = 'urn' | 'media';

export interface SodixToAmbOptions {
  /**
   * `urn` (default) yields `urn:sodix:<sodixId>` — stable across media moves.
   * `media` yields the media URL — dereferenceable, but a moved file produces
   * a new addressable event instead of an update.
   */
  idScheme?: SodixIdScheme;
  /** Overrides `idScheme` entirely. */
  idFor?: (sodixId: string, record: SodixRecord) => string;
  /** Extension namespace. Defaults to `de.sodix` (reverse-DNS per NIP-AMB). */
  extNamespace?: string;
}
