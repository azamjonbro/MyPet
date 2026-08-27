import { z } from 'zod';
import { SKILLS, GRAMMAR_TOPICS } from '../constants/grammarTopics.js';
import { localDateSchema } from './common.js';

/**
 * Events the CLIENT is allowed to report.
 *
 * Deliberately a short list: the client is the authority on how long its own
 * timer ran, and on nothing else. XP, streaks and mission completion are all
 * computed server-side, because a client can lie about them.
 */
export const CLIENT_EVENT_TYPES = ['practice.minutes'] as const;
export type ClientEventType = (typeof CLIENT_EVENT_TYPES)[number];

export const clientEventSchema = z.object({
  type: z.enum(CLIENT_EVENT_TYPES),
  value: z.number().min(0).max(240),
});

export const clientEventBatchSchema = z.object({
  events: z.array(clientEventSchema).min(1).max(50),
});
export type ClientEventBatch = z.infer<typeof clientEventBatchSchema>;

export const dailyTotalsSchema = z.object({
  minutes: z.number(),
  messages: z.number(),
  corrections: z.number(),
  wordsLearned: z.number(),
  missionsCompleted: z.number(),
  xp: z.number(),
});

export const progressSummarySchema = z.object({
  xp: z.number(),
  level: z.number(),
  title: z.string(),
  xpIntoLevel: z.number(),
  xpForNextLevel: z.number(),
  progress: z.number(),
  currentDay: z.number(),
  streak: z.object({
    current: z.number(),
    longest: z.number(),
    atRisk: z.boolean(),
  }),
  skills: z.object(
    Object.fromEntries(SKILLS.map((s) => [s, z.number()])) as Record<
      (typeof SKILLS)[number],
      z.ZodNumber
    >,
  ),
  today: dailyTotalsSchema,
});
export type ProgressSummary = z.infer<typeof progressSummarySchema>;

export const weaknessSchema = z.object({
  topicId: z.enum(GRAMMAR_TOPICS),
  label: z.string(),
  count: z.number(),
  lastSeen: z.string(),
  examples: z.array(z.object({ original: z.string(), corrected: z.string() })),
});
export type Weakness = z.infer<typeof weaknessSchema>;

export const historyDaySchema = z.object({
  localDate: localDateSchema,
  minutes: z.number(),
  messages: z.number(),
  corrections: z.number(),
  wordsLearned: z.number(),
  xp: z.number(),
});
export type HistoryDay = z.infer<typeof historyDaySchema>;
