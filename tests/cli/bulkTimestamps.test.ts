import { bulkTimestamp } from '../../src/cli/utils/bulk-timestamps';

const NOW = 1_800_000_000;

describe('bulkTimestamp', () => {
  it('puts the last record exactly at now', () => {
    expect(bulkTimestamp(9, 10, NOW)).toBe(NOW);
  });

  it('never returns a value in the future', () => {
    const total = 35_020;
    for (const index of [0, 1, 17_510, total - 2, total - 1]) {
      expect(bulkTimestamp(index, total, NOW)).toBeLessThanOrEqual(NOW);
    }
  });

  it('is strictly increasing and unique across a large batch', () => {
    const total = 5_000;
    const values = Array.from({ length: total }, (_, i) => bulkTimestamp(i, total, NOW));
    expect(new Set(values).size).toBe(total);
    for (let i = 1; i < total; i++) {
      expect(values[i]! - values[i - 1]!).toBe(1);
    }
  });

  it('spans exactly one second per record', () => {
    const total = 1_000;
    expect(bulkTimestamp(total - 1, total, NOW) - bulkTimestamp(0, total, NOW)).toBe(total - 1);
  });

  it('handles a single-record batch', () => {
    expect(bulkTimestamp(0, 1, NOW)).toBe(NOW);
  });

  it('rejects an index outside the batch', () => {
    expect(() => bulkTimestamp(10, 10, NOW)).toThrow(RangeError);
    expect(() => bulkTimestamp(-1, 10, NOW)).toThrow(RangeError);
    expect(() => bulkTimestamp(0, 0, NOW)).toThrow(RangeError);
  });

  it('would have dated a 35k batch 9.7 hours ahead under the old forward scheme', () => {
    // Guards the reason this exists: forward counting is what broke.
    const total = 35_020;
    const forward = NOW + (total - 1);
    expect((forward - NOW) / 3600).toBeGreaterThan(9);
    expect(bulkTimestamp(total - 1, total, NOW)).toBe(NOW);
  });
});
