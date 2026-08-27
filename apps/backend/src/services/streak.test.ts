import { describe, expect, it } from 'vitest';
import { applyActivity, streakAtRisk } from './streak.service.js';
import type { ProfileDoc } from '../models/index.js';

/** Minimal stand-in — applyActivity only touches these fields. */
function profile(overrides: Partial<{
  current: number; longest: number; last: string | null; graceWeek: string | null;
}> = {}) {
  return {
    streak: {
      current: overrides.current ?? 0,
      longest: overrides.longest ?? 0,
      lastActiveLocalDate: overrides.last ?? null,
    },
    graceUsedWeek: overrides.graceWeek ?? null,
  } as unknown as ProfileDoc;
}

describe('streak', () => {
  it('starts at 1 on the first day of practice', () => {
    const p = profile();
    expect(applyActivity(p, '2026-08-27').current).toBe(1);
  });

  it('does not double-count two sessions on the same day', () => {
    const p = profile({ current: 4, last: '2026-08-27' });
    const out = applyActivity(p, '2026-08-27');
    expect(out.current).toBe(4);
    expect(out.changed).toBe(false);
    expect(out.bonusXp).toBe(0);
  });

  it('increments on consecutive days', () => {
    const p = profile({ current: 6, longest: 6, last: '2026-08-26' });
    expect(applyActivity(p, '2026-08-27').current).toBe(7);
    expect(p.streak.longest).toBe(7);
  });

  it('forgives exactly one missed day, once a week', () => {
    const p = profile({ current: 6, longest: 9, last: '2026-08-25' }); // one day skipped
    const out = applyActivity(p, '2026-08-27');
    expect(out.graceApplied).toBe(true);
    expect(out.current).toBe(7);
    expect(p.graceUsedWeek).toBe('2026-W35');
  });

  it('will not forgive a second missed day in the same week', () => {
    const p = profile({ current: 7, longest: 9, last: '2026-08-25', graceWeek: '2026-W35' });
    const out = applyActivity(p, '2026-08-27');
    expect(out.graceApplied).toBe(false);
    expect(out.current).toBe(1);
  });

  it('offers the grace again in a new week', () => {
    const p = profile({ current: 7, longest: 9, last: '2026-09-01', graceWeek: '2026-W35' });
    const out = applyActivity(p, '2026-09-03'); // W36
    expect(out.graceApplied).toBe(true);
    expect(out.current).toBe(8);
  });

  it('resets after two or more missed days', () => {
    const p = profile({ current: 12, longest: 12, last: '2026-08-23' });
    const out = applyActivity(p, '2026-08-27');
    expect(out.current).toBe(1);
    expect(out.graceApplied).toBe(false);
  });

  it('never lowers the longest streak on a reset', () => {
    const p = profile({ current: 12, longest: 12, last: '2026-08-01' });
    applyActivity(p, '2026-08-27');
    expect(p.streak.longest).toBe(12);
  });

  it('does not hand the grace day to someone with no streak to protect', () => {
    const p = profile({ current: 0, last: '2026-08-25' });
    const out = applyActivity(p, '2026-08-27');
    expect(out.graceApplied).toBe(false);
    expect(out.current).toBe(1);
  });

  it('pays a bonus that grows with the streak but is capped', () => {
    expect(applyActivity(profile({ current: 2, last: '2026-08-26' }), '2026-08-27').bonusXp).toBe(15);
    expect(applyActivity(profile({ current: 40, last: '2026-08-26' }), '2026-08-27').bonusXp).toBe(50);
  });
});

describe('streak at risk', () => {
  it('stays quiet for a streak too short to be worth protecting', () => {
    expect(streakAtRisk(profile({ current: 2, last: '2026-08-26' }), '2026-08-27')).toBe(false);
  });

  it('flags a real streak that has had no practice today', () => {
    expect(streakAtRisk(profile({ current: 9, last: '2026-08-26' }), '2026-08-27')).toBe(true);
  });

  it('stays quiet once today has been practised', () => {
    expect(streakAtRisk(profile({ current: 9, last: '2026-08-27' }), '2026-08-27')).toBe(false);
  });
});
