import { describe, expect, it } from 'vitest';
import { isoWeek } from './week.js';

describe('ISO week keys', () => {
  it('gives the same key to every day of one week', () => {
    const monday = isoWeek('2026-08-24');
    for (const d of ['2026-08-25', '2026-08-26', '2026-08-29', '2026-08-30']) {
      expect(isoWeek(d)).toBe(monday);
    }
  });

  it('rolls over on Monday, not Sunday', () => {
    expect(isoWeek('2026-08-30')).not.toBe(isoWeek('2026-08-31')); // Sun → Mon
    expect(isoWeek('2026-08-29')).toBe(isoWeek('2026-08-30')); // Sat → Sun
  });

  it('handles the year boundary the ISO way', () => {
    // 1 Jan 2027 is a Friday, so it belongs to the last week of 2026.
    expect(isoWeek('2027-01-01')).toBe(isoWeek('2026-12-28'));
  });
});
