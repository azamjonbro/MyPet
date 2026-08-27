/**
 * XP and levelling. Server-authoritative: the extension renders these numbers
 * but never computes them, because a client can lie about its own progress.
 */

import type { Skill } from './grammarTopics.js';

export const XP_AWARD = {
  MESSAGE_SENT: 5,
  CORRECTION_ACCEPTED: 10,
  EXERCISE_CORRECT: 15,
  VOCAB_LEARNED: 5,
  TASK_COMPLETED: 40,
  MISSION_COMPLETED: 100,
  STREAK_BONUS_PER_DAY: 5,
  STREAK_BONUS_CAP: 50,
} as const;

export const XP_PER_TASK_TYPE: Record<Skill, number> = {
  grammar: 50,
  vocabulary: 30,
  speaking: 50,
  listening: 40,
  reading: 30,
  writing: 40,
};

/** Cumulative XP required to reach each level. Index 0 is level 1. */
export const LEVEL_THRESHOLDS = [
  0, 100, 250, 500, 850, 1300, 1900, 2650, 3550, 4600,
  5850, 7300, 8950, 10800, 12900, 15250, 17850, 20700, 23850, 27300,
] as const;

export const LEVEL_TITLES = [
  'First Words', 'Curious Beginner', 'Sentence Builder', 'English Explorer',
  'Steady Speaker', 'Confident Learner', 'Fluent Thinker', 'Word Collector',
  'Grammar Tamer', 'Storyteller', 'Debater', 'Nuance Hunter',
  'Idiom Wrangler', 'Near Native', 'Wordsmith', 'Polyglot',
  'Linguist', 'Orator', 'Master', 'Legend',
] as const;

export interface LevelInfo {
  level: number;
  title: string;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progress: number; // 0..1
}

export function levelFromXp(xp: number): LevelInfo {
  const safeXp = Math.max(0, Math.floor(xp));
  let index = 0;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (safeXp >= (LEVEL_THRESHOLDS[i] ?? 0)) index = i;
    else break;
  }
  const floor = LEVEL_THRESHOLDS[index] ?? 0;
  const ceiling = LEVEL_THRESHOLDS[index + 1];
  const title = LEVEL_TITLES[index] ?? LEVEL_TITLES[LEVEL_TITLES.length - 1]!;

  if (ceiling === undefined) {
    return { level: index + 1, title, xpIntoLevel: safeXp - floor, xpForNextLevel: 0, progress: 1 };
  }
  const span = ceiling - floor;
  return {
    level: index + 1,
    title,
    xpIntoLevel: safeXp - floor,
    xpForNextLevel: span,
    progress: span === 0 ? 1 : (safeXp - floor) / span,
  };
}

export function streakBonus(streakDays: number): number {
  return Math.min(XP_AWARD.STREAK_BONUS_CAP, Math.max(0, streakDays) * XP_AWARD.STREAK_BONUS_PER_DAY);
}
