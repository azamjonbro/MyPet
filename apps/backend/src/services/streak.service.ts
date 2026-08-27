import { streakBonus } from '@pet/shared';
import type { ProfileDoc } from '../models/index.js';
import { daysBetween } from '../utils/date.js';
import { isoWeek } from '../utils/week.js';

/**
 * The streak.
 *
 * Design decision worth stating: **one grace day per week, applied silently.**
 * A streak that shatters the first time somebody has a bad Tuesday stops being
 * motivating and starts being a reason to quit — which is the actual product
 * risk in a 90-day plan (§O). The grace is not announced, because a learner who
 * knows about it starts spending it.
 *
 * The streak measures showing up. It is deliberately independent of the plan
 * day, which measures work done.
 */
export interface StreakOutcome {
  current: number;
  longest: number;
  changed: boolean;
  graceApplied: boolean;
  bonusXp: number;
}

export function applyActivity(profile: ProfileDoc, todayLocal: string): StreakOutcome {
  const streak = profile.streak;
  const last = streak.lastActiveLocalDate ?? null;

  // Already counted today.
  if (last === todayLocal) {
    return {
      current: streak.current,
      longest: streak.longest,
      changed: false,
      graceApplied: false,
      bonusXp: 0,
    };
  }

  const gap = last ? daysBetween(last, todayLocal) : Number.POSITIVE_INFINITY;
  const thisWeek = isoWeek(todayLocal);
  const graceAvailable = profile.graceUsedWeek !== thisWeek;

  let current: number;
  let graceApplied = false;

  if (gap === 1) {
    current = streak.current + 1;
  } else if (gap === 2 && graceAvailable && streak.current > 0) {
    // Exactly one day missed, and the week's grace is unspent.
    current = streak.current + 1;
    graceApplied = true;
    profile.graceUsedWeek = thisWeek;
  } else {
    current = 1;
  }

  streak.current = current;
  streak.longest = Math.max(streak.longest, current);
  streak.lastActiveLocalDate = todayLocal;

  return {
    current,
    longest: streak.longest,
    changed: true,
    graceApplied,
    bonusXp: streakBonus(current),
  };
}

/** Read-only view for the dashboard — never mutates. */
export function streakAtRisk(profile: ProfileDoc, todayLocal: string): boolean {
  if (profile.streak.current < 3) return false; // a one-day streak is not worth a nudge
  return profile.streak.lastActiveLocalDate !== todayLocal;
}
