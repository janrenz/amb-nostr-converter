/**
 * AMB to Nostr Converter
 * Converts AMB learning resources to Nostr educational events
 */

import crypto from 'crypto';
import { nip19 } from 'nostr-tools';
import { canonicalConceptId } from '../utils/conceptId.js';
import {
  AmbLearningResource,
  getResourceType,
  Person,
  Organization,
  Concept,
  LocalizedString,
  MediaObject,
  FundingScheme,
} from '../types/amb.js';
import {
  NostrEducationalEvent,
  NostrEducationalKind,
  NostrTag,
  createTag,
  NostrEducationalContent,
} from '../types/nostr.js';
import {
  ConversionOptions,
  ConversionResult,
  ConversionError,
  ConversionErrorCode,
} from '../types/index.js';

/**
 * Default public key for testing (should be overridden in production)
 */
const DEFAULT_PUBKEY = '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Guard a value that becomes one segment of a colon-delimited ext tag key.
 * A colon here would produce a key no consumer can segment unambiguously, and
 * NIP-AMB requires those to be ignored — so emitting one silently loses the
 * data downstream. Fail at the serializer instead.
 */
function assertColonFree(value: string, what: string): void {
  if (value.includes(':')) {
    throw new ConversionError(
      `${what} "${value}" must not contain ':' — a sub-vocabulary belongs in the namespace ` +
        `(e.g. "org.edufeed.ekw.konfi:zielgruppen"), not as a colon inside a segment`,
      ConversionErrorCode.INVALID_FORMAT
    );
  }
}

/**
 * Convert AMB learning resource to Nostr educational event
 */
export function ambToNostr(
  ambResource: AmbLearningResource,
  options: ConversionOptions = {}
): ConversionResult<NostrEducationalEvent> {
  const warnings: string[] = [];

  try {
    // Validate input
    if (!ambResource.id) {
      throw new ConversionError(
        'AMB resource must have an id',
        ConversionErrorCode.MISSING_REQUIRED_FIELD
      );
    }

    if (!ambResource.name) {
      throw new ConversionError(
        'AMB resource must have a name',
        ConversionErrorCode.MISSING_REQUIRED_FIELD
      );
    }

    // All AMB events use kind 30142 (AMB Metadata Event)
    const kind = NostrEducationalKind.AMB;

    // Get pubkey (required for Nostr events)
    const pubkey = options.pubkey || DEFAULT_PUBKEY;
    if (pubkey === DEFAULT_PUBKEY) {
      warnings.push('Using default pubkey - should provide a real pubkey in production');
    }

    // Get timestamp
    const created_at = options.timestamp || Math.floor(Date.now() / 1000);

    // Normalize non-standard AMB fields
    // Some sources (e.g. sitemap parsers) emit `type` as Concept[] instead of string[]
    let normalizedTypes: string[];
    const rawTypes = Array.isArray(ambResource.type) ? ambResource.type : [ambResource.type];
    if (rawTypes.length > 0 && typeof rawTypes[0] === 'object') {
      warnings.push('Non-standard AMB: type contains Concept objects instead of strings, normalizing via id');
      normalizedTypes = rawTypes.map((t: any) => t.id || String(t));
    } else {
      normalizedTypes = rawTypes as string[];
    }

    // Some sources emit `license` as Concept[] instead of { id: string } (e.g. a
    // combined CC BY-SA license expressed as separate attribution/shareAlike
    // concepts in the DINI AG KIM license-type vocabulary). Keep every entry
    // that has an id, in order, so none of the license semantics are dropped.
    let normalizedLicenses: Array<{ id: string }> = [];
    if (ambResource.license) {
      if (Array.isArray(ambResource.license)) {
        warnings.push('Non-standard AMB: license is an array of Concepts');
        normalizedLicenses = (ambResource.license as any[])
          .filter(entry => entry?.id)
          .map(entry => ({ id: entry.id }));
      } else if ((ambResource.license as any)?.id) {
        normalizedLicenses = [ambResource.license];
      }
    }

    // Build tags array
    const tags: NostrTag[] = [];
    // One companion `a` tag per (address, prefix) per event.
    const companionSeen = new Set<string>();
    const emitConcept = (prefix: string, concept: Concept | undefined | null) => {
      if (!concept) return;
      emitConceptTags(tags, prefix, concept, options, companionSeen, warnings);
    };

    // Add deterministic identifier (d tag) - use original AMB ID directly per spec
    tags.push(createTag('d', ambResource.id));

    // Add resource types (can be multiple)
    normalizedTypes.forEach(type => {
      tags.push(createTag('type', type));
    });

    // Add name (spec uses 'name' not 'title')
    tags.push(createTag('name', ambResource.name));

    // Add description
    if (ambResource.description) {
      tags.push(createTag('description', ambResource.description));
    }

    // Add keywords as hashtags (Nostr-native 't' tags)
    // Preserve original case for lossless roundtrip
    if (ambResource.keywords && ambResource.keywords.length > 0) {
      ambResource.keywords.forEach(keyword => {
        tags.push(createTag('t', keyword));
      });
    }

    // Add languages
    if (ambResource.inLanguage && ambResource.inLanguage.length > 0) {
      ambResource.inLanguage.forEach(lang => {
        tags.push(createTag('inLanguage', lang));
      });
    }

    // Add creators/contributors. Per NIP-AMB, each person gets exactly one
    // representation (never both): a Nostr identity (nostr: URI id, or the
    // deprecated nostrPubkey field) emits only a p tag; everyone else gets
    // flattened tags.
    const addPersonEntity = (
      entity: Person | Organization,
      role: 'creator' | 'contributor'
    ): void => {
      const entityId = 'id' in entity ? entity.id : undefined;
      const decoded = decodeNostrPersonId(entityId);
      if (decoded) {
        const relayHint = decoded.relays[0]
          || (('relayHint' in entity && entity.relayHint) ? entity.relayHint : '')
          || options.defaultRelayHint
          || '';
        tags.push(['p', decoded.pubkey, relayHint, role]);
        return;
      }
      if (entityId?.startsWith('nostr:')) {
        warnings.push(`${role} id "${entityId}" looks like a nostr: URI but could not be decoded; emitting flattened tags`);
      } else if ('nostrPubkey' in entity && entity.nostrPubkey) {
        const relayHint = ('relayHint' in entity && entity.relayHint)
          ? entity.relayHint
          : options.defaultRelayHint || '';
        tags.push(['p', entity.nostrPubkey, relayHint, role]);
        return;
      }
      addPersonOrOrgTags(tags, role, entity);
    };

    if (ambResource.creator && ambResource.creator.length > 0) {
      ambResource.creator.forEach(creator => addPersonEntity(creator, 'creator'));
    }

    if (ambResource.contributor && ambResource.contributor.length > 0) {
      ambResource.contributor.forEach(contributor => addPersonEntity(contributor, 'contributor'));
    }

    // Add publishers (using colon-delimited tags)
    if (ambResource.publisher && ambResource.publisher.length > 0) {
      ambResource.publisher.forEach(publisher => {
        addPersonOrOrgTags(tags, 'publisher', publisher);
      });
    }

    // Add funders (using colon-delimited tags)
    if (ambResource.funder && ambResource.funder.length > 0) {
      ambResource.funder.forEach(funder => {
        addPersonOrOrgTags(tags, 'funder', funder);
      });
    }

    // Add license (using colon-delimited tag) - one `license:id` tag per
    // concept, in order, so a multi-concept license (e.g. CC BY-SA expressed
    // as attribution + shareAlike) round-trips without losing entries.
    normalizedLicenses.forEach(license => {
      tags.push(createTag('license:id', license.id));
    });

    // Add free access flag (spec uses full name)
    if (typeof ambResource.isAccessibleForFree === 'boolean') {
      tags.push(createTag('isAccessibleForFree', ambResource.isAccessibleForFree.toString()));
    }

    // Add conditions of access (using colon-delimited tags)
    if (ambResource.conditionsOfAccess) {
      if (ambResource.conditionsOfAccess.id) {
        tags.push(createTag('conditionsOfAccess:id', ambResource.conditionsOfAccess.id));
      }
      if (ambResource.conditionsOfAccess.prefLabel) {
        Object.entries(ambResource.conditionsOfAccess.prefLabel).forEach(([lang, label]) => {
          tags.push(createTag(`conditionsOfAccess:prefLabel:${lang}`, label));
        });
      }
      if (ambResource.conditionsOfAccess.type) {
        tags.push(createTag('conditionsOfAccess:type', ambResource.conditionsOfAccess.type));
      }
    }

    // Add subjects (using colon-delimited tags)
    if (ambResource.about && ambResource.about.length > 0) {
      ambResource.about.forEach(subject => emitConcept('about', subject));
    }

    // Add educational level (using colon-delimited tags)
    if (ambResource.educationalLevel && ambResource.educationalLevel.length > 0) {
      ambResource.educationalLevel.forEach(level => emitConcept('educationalLevel', level));
    }

    // Add audience (using colon-delimited tags)
    if (ambResource.audience && ambResource.audience.length > 0) {
      ambResource.audience.forEach(aud => emitConcept('audience', aud));
    }

    // Add learning resource type (using colon-delimited tags)
    if (ambResource.learningResourceType && ambResource.learningResourceType.length > 0) {
      ambResource.learningResourceType.forEach(lrt => emitConcept('learningResourceType', lrt));
    }

    // Add published date (spec uses 'datePublished')
    if (ambResource.datePublished) {
      tags.push(createTag('datePublished', ambResource.datePublished));
    }

    // Add creation date (spec uses 'dateCreated')
    if (ambResource.dateCreated) {
      tags.push(createTag('dateCreated', ambResource.dateCreated));
    }

    // Add modification date
    if (ambResource.dateModified) {
      tags.push(createTag('dateModified', ambResource.dateModified));
    }

    // Add duration (ISO8601 format)
    if (ambResource.duration) {
      tags.push(createTag('duration', ambResource.duration));
    }

    // Add suggestedAge (object with integer minValue/maxValue bounds)
    if (ambResource.suggestedAge) {
      if (ambResource.suggestedAge.minValue !== undefined) {
        tags.push(createTag('suggestedAge:minValue', String(ambResource.suggestedAge.minValue)));
      }
      if (ambResource.suggestedAge.maxValue !== undefined) {
        tags.push(createTag('suggestedAge:maxValue', String(ambResource.suggestedAge.maxValue)));
      }
    }

    // Add image
    if (ambResource.image) {
      tags.push(createTag('image', ambResource.image));
    }

    // Add trailer (MediaObject)
    if (ambResource.trailer) {
      addMediaObjectTags(tags, 'trailer', ambResource.trailer);
    }

    // Add encoding (MediaObject array)
    if (ambResource.encoding && ambResource.encoding.length > 0) {
      ambResource.encoding.forEach(enc => {
        addMediaObjectTags(tags, 'encoding', enc);
      });
    }

    // Add caption (MediaObject array)
    if (ambResource.caption && ambResource.caption.length > 0) {
      ambResource.caption.forEach(cap => {
        addMediaObjectTags(tags, 'caption', cap);
      });
    }

    // Add teaches (Concept array)
    if (ambResource.teaches && ambResource.teaches.length > 0) {
      ambResource.teaches.forEach(concept => emitConcept('teaches', concept));
    }

    // Add assesses (Concept array)
    if (ambResource.assesses && ambResource.assesses.length > 0) {
      ambResource.assesses.forEach(concept => emitConcept('assesses', concept));
    }

    // Add competencyRequired (Concept array)
    if (ambResource.competencyRequired && ambResource.competencyRequired.length > 0) {
      ambResource.competencyRequired.forEach(concept => emitConcept('competencyRequired', concept));
    }

    // Add interactivityType (Concept)
    if (ambResource.interactivityType) {
      emitConcept('interactivityType', ambResource.interactivityType);
    }

    // Add mainEntityOfPage (array of complex objects)
    if (ambResource.mainEntityOfPage && ambResource.mainEntityOfPage.length > 0) {
      ambResource.mainEntityOfPage.forEach(entity => {
        tags.push(createTag('mainEntityOfPage:id', entity.id));
        if (entity.type) {
          tags.push(createTag('mainEntityOfPage:type', entity.type));
        }
        if (entity.provider) {
          if (entity.provider.id) {
            tags.push(createTag('mainEntityOfPage:provider:id', entity.provider.id));
          }
          if (entity.provider.name) {
            tags.push(createTag('mainEntityOfPage:provider:name', entity.provider.name));
          }
          if (entity.provider.type) {
            tags.push(createTag('mainEntityOfPage:provider:type', entity.provider.type));
          }
        }
        if (entity.dateCreated) {
          tags.push(createTag('mainEntityOfPage:dateCreated', entity.dateCreated));
        }
        if (entity.dateModified) {
          tags.push(createTag('mainEntityOfPage:dateModified', entity.dateModified));
        }
        // Add Nostr-native r tag for the URL
        tags.push(['r', entity.id]);
      });
    }

    // Add relationships if requested (using colon-delimited tags + optional a tags)
    if (options.includeRelationships !== false) {
      const addRelationshipTags = (prefix: string, refs: typeof ambResource.hasPart) => {
        if (!refs || refs.length === 0) return;
        refs.forEach(ref => {
          if (ref.id) {
            tags.push(createTag(`${prefix}:id`, ref.id));
          }
          if (ref.name) {
            tags.push(createTag(`${prefix}:name`, ref.name));
          }
          if (ref.type) {
            const types = Array.isArray(ref.type) ? ref.type : [ref.type];
            types.forEach(type => {
              tags.push(createTag(`${prefix}:type`, type));
            });
          }
          // Add nested creator tags
          if (ref.creator && ref.creator.length > 0) {
            ref.creator.forEach(creator => {
              addPersonOrOrgTags(tags, `${prefix}:creator`, creator);
            });
          }
          // Add nested license tag(s)
          // String license uses prefix:license (simple value)
          // Object license uses prefix:license:id (nested structure)
          // Non-standard array-of-Concepts license (see top-level license
          // handling above) emits one prefix:license:id tag per entry, in order.
          if (ref.license) {
            if (typeof ref.license === 'string') {
              tags.push(createTag(`${prefix}:license`, ref.license));
            } else if (Array.isArray(ref.license)) {
              warnings.push(`Non-standard AMB: ${prefix}.license is an array of Concepts`);
              (ref.license as any[])
                .filter(entry => entry?.id)
                .forEach(entry => {
                  tags.push(createTag(`${prefix}:license:id`, entry.id));
                });
            } else if (ref.license.id) {
              tags.push(createTag(`${prefix}:license:id`, ref.license.id));
            }
          }
          // Add Nostr-native a tag if event info is available
          const eventInfo = ref.nostrEvent || options.relatedEvents?.[ref.id];
          if (eventInfo) {
            const aTagValue = `30142:${eventInfo.pubkey}:${eventInfo.dTag}`;
            tags.push(['a', aTagValue, eventInfo.relayHint || '', prefix]);
          }
        });
      };

      addRelationshipTags('hasPart', ambResource.hasPart);
      addRelationshipTags('isPartOf', ambResource.isPartOf);
      addRelationshipTags('isBasedOn', ambResource.isBasedOn);
    }

    // Add extension properties (ext namespace) — symmetric with nostrToAmb reconstruction.
    // Concept facets emit id, prefLabel:<lang>(s), type (order matters for reverse boundary).
    // Scalar facets emit a bare ext:<ns>:<facet> tag per value.
    //
    // <ns>, <facet> and the prefLabel language MUST be colon-free: a surplus
    // colon makes the emitted key ambiguous to parse, and consumers are
    // required to ignore such keys outright. This serializer is the only
    // enforcement point on the write side, so it fails rather than emitting a
    // tag that will be silently dropped downstream. Sub-vocabularies belong in
    // <ns> (e.g. "org.edufeed.ekw.konfi"), never as a colon inside <facet>.
    if (ambResource.ext) {
      for (const [ns, facets] of Object.entries(ambResource.ext)) {
        assertColonFree(ns, 'ext namespace');
        for (const [facet, items] of Object.entries(facets)) {
          assertColonFree(facet, `ext facet in namespace "${ns}"`);
          for (const item of items as Array<any>) {
            if (typeof item === 'string') {
              tags.push(createTag(`ext:${ns}:${facet}`, item));
            } else if (item && typeof item === 'object') {
              const prefix = `ext:${ns}:${facet}`;
              const canon = item.id ? canonicalConceptId(item.id) : undefined;
              if (canon?.warning) warnings.push(canon.warning);
              if (canon) tags.push(createTag(`${prefix}:id`, canon.id));
              if (item.prefLabel) {
                for (const [lang, label] of Object.entries(item.prefLabel)) {
                  assertColonFree(lang, `ext prefLabel language for "${ns}:${facet}"`);
                  tags.push(createTag(`${prefix}:prefLabel:${lang}`, label as string));
                }
              }
              tags.push(createTag(`${prefix}:type`, item.type || 'Concept'));
              if (canon) pushCompanionTag(tags, prefix, canon, options, companionSeen);
            }
          }
        }
      }
    }

    // Create the Nostr event
    // Per AMB spec, content SHOULD contain description for client compatibility
    // The description tag is kept for relay queryability
    const event: NostrEducationalEvent = {
      pubkey,
      created_at,
      kind,
      tags,
      content: ambResource.description || '',
    };

    const result: ConversionResult<NostrEducationalEvent> = {
      success: true,
      data: event,
    };
    
    if (warnings.length > 0) {
      result.warnings = warnings;
    }
    
    return result;
  } catch (error) {
    if (error instanceof ConversionError) {
      return {
        success: false,
        error,
      };
    }

    return {
      success: false,
      error: new ConversionError(
        `Conversion failed: ${error instanceof Error ? error.message : String(error)}`,
        ConversionErrorCode.CONVERSION_FAILED,
        error
      ),
    };
  }
}


/**
 * Decode a `nostr:npub…`/`nostr:nprofile…` id (NIP-21) to a hex pubkey plus
 * any embedded relay hints, else null.
 */
function decodeNostrPersonId(
  id: string | undefined
): { pubkey: string; relays: string[] } | null {
  if (!id || !id.startsWith('nostr:')) return null;
  try {
    const decoded = nip19.decode(id.slice('nostr:'.length));
    if (decoded.type === 'npub') {
      return { pubkey: decoded.data as string, relays: [] };
    }
    if (decoded.type === 'nprofile') {
      const data = decoded.data as { pubkey: string; relays?: string[] };
      return { pubkey: data.pubkey, relays: data.relays ?? [] };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Extract name from Person or Organization
 * Does NOT bake in honorificPrefix - that is kept as a separate tag for lossless roundtrip
 */
function getPersonOrOrgName(entity: Person | Organization | FundingScheme): string {
  return entity.name;
}

/**
 * Add tags for Person, Organization, or FundingScheme
 */
function addPersonOrOrgTags(
  tags: NostrTag[],
  prefix: string,
  entity: Person | Organization | FundingScheme
): void {
  tags.push(createTag(`${prefix}:name`, getPersonOrOrgName(entity)));
  tags.push(createTag(`${prefix}:type`, entity.type));

  if ('id' in entity && entity.id) {
    tags.push(createTag(`${prefix}:id`, entity.id));
  }

  if ('honorificPrefix' in entity && entity.honorificPrefix) {
    tags.push(createTag(`${prefix}:honorificPrefix`, entity.honorificPrefix));
  }

  if ('honorificSuffix' in entity && entity.honorificSuffix) {
    tags.push(createTag(`${prefix}:honorificSuffix`, entity.honorificSuffix));
  }

  if ('email' in entity && entity.email) {
    tags.push(createTag(`${prefix}:email`, entity.email));
  }

  if ('url' in entity && entity.url) {
    tags.push(createTag(`${prefix}:url`, entity.url));
  }

  if ('affiliation' in entity && entity.affiliation) {
    const affiliation = entity.affiliation;
    if (affiliation.name) {
      tags.push(createTag(`${prefix}:affiliation:name`, affiliation.name));
    }
    if (affiliation.type) {
      tags.push(createTag(`${prefix}:affiliation:type`, affiliation.type));
    }
    if (affiliation.id) {
      tags.push(createTag(`${prefix}:affiliation:id`, affiliation.id));
    }
    if (affiliation.url) {
      tags.push(createTag(`${prefix}:affiliation:url`, affiliation.url));
    }
    if (affiliation.email) {
      tags.push(createTag(`${prefix}:affiliation:email`, affiliation.email));
    }
  }
}

/**
 * Add tags for MediaObject
 */
function addMediaObjectTags(
  tags: NostrTag[],
  prefix: string,
  media: MediaObject
): void {
  if (media.id) {
    tags.push(createTag(`${prefix}:id`, media.id));
  }
  if (media.type) {
    tags.push(createTag(`${prefix}:type`, media.type));
  }
  if (media.contentUrl) {
    tags.push(createTag(`${prefix}:contentUrl`, media.contentUrl));
  }
  if (media.embedUrl) {
    tags.push(createTag(`${prefix}:embedUrl`, media.embedUrl));
  }
  if (media.encodingFormat) {
    tags.push(createTag(`${prefix}:encodingFormat`, media.encodingFormat));
  }
  if (media.sha256) {
    tags.push(createTag(`${prefix}:sha256`, media.sha256));
  }
  if (media.inLanguage) {
    tags.push(createTag(`${prefix}:inLanguage`, media.inLanguage));
  }
  if (media.contentSize) {
    tags.push(createTag(`${prefix}:contentSize`, media.contentSize));
  }
  if (media.bitrate) {
    tags.push(createTag(`${prefix}:bitrate`, media.bitrate));
  }
}

/**
 * Add tags for Concept
 */
/**
 * Flattened concept triple (`<prefix>:id`, `:prefLabel:<lang>`, `:type`) with the id
 * canonicalised per NIP-VOCAB, followed by the companion `a` tag when the concept
 * is published on Nostr (see pushCompanionTag).
 */
function emitConceptTags(
  tags: NostrTag[],
  prefix: string,
  concept: Concept,
  options: ConversionOptions,
  companionSeen: Set<string>,
  warnings: string[]
): void {
  const canon = concept.id ? canonicalConceptId(concept.id) : undefined;
  if (canon?.warning) warnings.push(canon.warning);
  if (canon) {
    tags.push(createTag(`${prefix}:id`, canon.id));
  }
  if (concept.prefLabel) {
    Object.entries(concept.prefLabel).forEach(([lang, label]) => {
      tags.push(createTag(`${prefix}:prefLabel:${lang}`, label));
    });
  }
  if (concept.type) {
    tags.push(createTag(`${prefix}:type`, concept.type));
  }
  if (canon) pushCompanionTag(tags, prefix, canon, options, companionSeen);
}

/**
 * ["a", "<kind>:<pubkey>:<d>", <relay-hint>, "<prefix>"] — an index and relay hint for a
 * concept identified by a Nostr URI; the `<prefix>:id` tag stays authoritative. The hint
 * is the one carried by a received naddr, else options.defaultRelayHint, else ''.
 * Emitted once per (address, prefix) per event; disabled by conceptCompanionTags: false.
 */
function pushCompanionTag(
  tags: NostrTag[],
  prefix: string,
  canon: { address?: string; relayHint?: string },
  options: ConversionOptions,
  companionSeen: Set<string>
): void {
  if (options.conceptCompanionTags === false || !canon.address) return;
  // Companion tags are defined for NIP-VOCAB entities (39737 scheme, 39738 concept,
  // 39739 collection). A Nostr URI of another kind is still a valid identifier but
  // gets no companion tag.
  const kind = Number(canon.address.split(':')[0]);
  if (kind < 39737 || kind > 39739) return;
  const key = `${canon.address}\u0000${prefix}`;
  if (companionSeen.has(key)) return;
  companionSeen.add(key);
  tags.push(['a', canon.address, canon.relayHint ?? options.defaultRelayHint ?? '', prefix]);
}
