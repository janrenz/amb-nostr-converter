/**
 * Selection filters for SODIX corpora.
 *
 * Which subset to publish is the most consequential decision in a SODIX
 * pipeline, because the corpus is mostly not openly licensed. Measured over
 * 203809 records of the live API (August 2026):
 *
 *   CC license URI          18.6%   genuinely open
 *   "Copyright, freier Zugang"  53.0%   copyrighted, free *access*
 *   "Copyright, lizenzpflichtig" 25.1%   copyrighted, license required
 *   paymentType PAID        23.5%
 *   downloadRight false     29.5%
 *
 * `openLicense` is therefore the conservative default for any publishing path.
 * Distributing metadata is the normal case for AMB/OERSI — titles, descriptions
 * and links travel, not the media files — but whether a given source's terms of
 * use permit it is a legal question, not a technical one.
 */

import type { SodixRecord } from './types.js';
import { isOpenLicense } from './vocab.js';

export type SodixFilter = (record: SodixRecord) => boolean;

/** Active records carrying a real CC license URI. */
export const openLicense: SodixFilter = (record) =>
  record.recordStatus === 'ACTIVATED' && isOpenLicense(record.rights?.license?.url);

/** Active records that cost nothing — largely still copyrighted. */
export const freeOfCharge: SodixFilter = (record) =>
  record.recordStatus === 'ACTIVATED' && record.paymentType === 'NOT_PAID';

/** Every active record, purchased media included. */
export const activated: SodixFilter = (record) => record.recordStatus === 'ACTIVATED';

/** No selection at all. */
export const everything: SodixFilter = () => true;

export const SODIX_FILTERS: Readonly<Record<string, SodixFilter>> = {
  'open-license': openLicense,
  free: freeOfCharge,
  activated,
  all: everything,
};
