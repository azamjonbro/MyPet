import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, localDate, planDayFor } from './date.js';

describe('local dates', () => {
  it('uses the learner timezone, not UTC', () => {
    // 22:30 UTC on the 1st is already the 2nd in Tashkent (UTC+5, so 03:30).
    // But the day boundary is 04:00, so it should still read as the 1st.
    const at = new Date('2026-03-01T22:30:00Z');
    expect(localDate('Asia/Tashkent', at)).toBe('2026-03-01');
  });

  it('rolls the day over after the 04:00 boundary', () => {
    const at = new Date('2026-03-02T00:00:00Z'); // 05:00 in Tashkent
    expect(localDate('Asia/Tashkent', at)).toBe('2026-03-02');
  });

  it('a late-night session still counts as the previous day', () => {
    const at = new Date('2026-03-02T19:30:00Z'); // 00:30 next day in Tashkent
    expect(localDate('Asia/Tashkent', at)).toBe('2026-03-02');
  });

  it('two learners in different zones can be on different dates at once', () => {
    const at = new Date('2026-03-01T18:00:00Z');
    expect(localDate('Pacific/Auckland', at)).not.toBe(localDate('America/Los_Angeles', at));
  });
});

describe('plan day derivation', () => {
  it('is 1 on the start date, not 0', () => {
    expect(planDayFor('2026-03-01', '2026-03-01')).toBe(1);
  });

  it('counts elapsed days', () => {
    expect(planDayFor('2026-03-01', '2026-03-17')).toBe(17);
  });

  it('caps at 90', () => {
    expect(planDayFor('2026-01-01', '2027-01-01')).toBe(90);
  });

  it('is 0 before onboarding sets a start date', () => {
    expect(planDayFor(null, '2026-03-17')).toBe(0);
  });

  it('cannot go negative if the clock moves backwards', () => {
    expect(planDayFor('2026-03-10', '2026-03-01')).toBe(0);
  });

  it('does not drift when days are skipped — it is derived, never incremented', () => {
    const start = '2026-03-01';
    expect(planDayFor(start, addDays(start, 40))).toBe(41);
    expect(daysBetween(start, addDays(start, 40))).toBe(40);
  });
});
