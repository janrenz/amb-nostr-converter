/**
 * created_at values for a bulk conversion.
 *
 * Relays keep only the newest version of an addressable event and clients
 * paginate on `created_at`, so a batch needs values that are unique and
 * strictly increasing. The obvious way — start at now and add one second per
 * record — satisfies that and breaks something worse: at one second per
 * record a 35k batch reaches 9.7 hours into the future. Future-dated events
 * skew `since`/`until` filters, are rejected outright by relays that refuse
 * them, and cannot be corrected afterwards, because a correction carrying the
 * real current time is "older" than the event it should replace.
 *
 * Counting backwards from now keeps the ordering guarantees and puts the
 * newest record exactly at now, so nothing is ever dated in the future.
 */
export function bulkTimestamp(index: number, total: number, now: number): number {
  if (!Number.isInteger(index) || index < 0) throw new RangeError(`index must be a non-negative integer, got ${index}`);
  if (!Number.isInteger(total) || total < 1) throw new RangeError(`total must be a positive integer, got ${total}`);
  if (index >= total) throw new RangeError(`index ${index} is out of range for total ${total}`);
  return now - (total - 1 - index);
}

/** Current time in whole seconds, the unit Nostr uses for `created_at`. */
export const nowInSeconds = (): number => Math.floor(Date.now() / 1000);
