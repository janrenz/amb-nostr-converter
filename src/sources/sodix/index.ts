/**
 * SODIX source adapter: SODIX API v3 → AMB.
 *
 * Turns records from the German federal-state media platform SODIX into AMB,
 * ready for `ambToNostr()`. Kept separate from the core converter because it is
 * source-specific: the converter speaks AMB, this speaks SODIX.
 */

export { sodixToAmb, SODIX_EXT_NAMESPACE } from './sodixToAmb.js';
export * from './filters.js';
export * from './types.js';
export {
  LEARNING_RESOURCE_TYPES as SODIX_LEARNING_RESOURCE_TYPES,
  EDUCATIONAL_LEVELS as SODIX_EDUCATIONAL_LEVELS,
  SUBJECTS as SODIX_SUBJECTS,
  LANGUAGES as SODIX_LANGUAGES,
  LANGUAGE_MARKERS as SODIX_LANGUAGE_MARKERS,
  normalizeLicenseUrl,
  isOpenLicense,
  durationToIso8601,
  type KimConcept,
} from './vocab.js';
