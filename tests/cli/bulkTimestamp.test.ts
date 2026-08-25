import { describe, it, expect } from 'vitest';
import { bulkTimestamp } from '../../src/cli/commands/convert.js';

/**
 * Bulk conversions need a unique created_at per event: a whole batch sharing one
 * timestamp breaks relays that paginate with `until = oldest - 1`, which either
 * drops events silently or loops.
 *
 * The uniqueness must not be bought by dating events into the future. kind-30142
 * is addressable, so a relay keeps the highest created_at per kind:pubkey:d — a
 * future-dated event makes any later correction published at real wall-clock time
 * look stale, and the correction is silently discarded. Counting backwards from
 * `now` gives the same uniqueness with the batch ending at the present.
 */
describe('bulkTimestamp', () => {
  const now = 1787649370;

  it('gives the last event in a batch the current time', () => {
    expect(bulkTimestamp(now, 16138, 16139)).toBe(now);
  });

  it('never returns a timestamp in the future', () => {
    const total = 500;
    for (let i = 0; i < total; i++) {
      expect(bulkTimestamp(now, i, total)).toBeLessThanOrEqual(now);
    }
  });

  it('increases strictly by one second per event', () => {
    const total = 10;
    const stamps = Array.from({ length: total }, (_, i) => bulkTimestamp(now, i, total));

    for (let i = 1; i < total; i++) {
      expect(stamps[i] - stamps[i - 1]).toBe(1);
    }
  });

  it('starts the batch total-1 seconds before now', () => {
    expect(bulkTimestamp(now, 0, 16139)).toBe(now - 16138);
  });

  it('uses the current time for a single-item batch', () => {
    expect(bulkTimestamp(now, 0, 1)).toBe(now);
  });
});
