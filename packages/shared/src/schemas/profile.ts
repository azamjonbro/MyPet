import { z } from 'zod';
import { CEFR_LEVELS, TARGET_EXAMS } from '../constants/cefr.js';
import { SKILLS } from '../constants/grammarTopics.js';
import { localDateSchema, timezoneSchema } from './common.js';

export const skillScoresSchema = z.object(
  Object.fromEntries(SKILLS.map((s) => [s, z.number().min(0).max(100)])) as Record<
    (typeof SKILLS)[number],
    z.ZodNumber
  >,
);
export type SkillScores = z.infer<typeof skillScoresSchema>;

export const streakSchema = z.object({
  current: z.number().int().min(0),
  longest: z.number().int().min(0),
  lastActiveLocalDate: localDateSchema.nullable(),
  graceUsedThisWeek: z.boolean(),
});

export const profileSchema = z.object({
  level: z.enum(CEFR_LEVELS),
  targetLevel: z.enum(CEFR_LEVELS),
  targetExam: z.enum(TARGET_EXAMS),
  dailyGoalMinutes: z.number().int().min(5).max(240),
  planStartDate: localDateSchema.nullable(),
  currentDay: z.number().int().min(0).max(90),
  /** Onboarding is what starts the 90-day clock, so the two are reported together. */
  onboarded: z.boolean(),
  xp: z.number().int().min(0),
  petLevel: z.number().int().min(1),
  petTitle: z.string(),
  streak: streakSchema,
  skills: skillScoresSchema,
});
export type Profile = z.infer<typeof profileSchema>;

export const updateProfileSchema = z
  .object({
    level: z.enum(CEFR_LEVELS),
    targetLevel: z.enum(CEFR_LEVELS),
    targetExam: z.enum(TARGET_EXAMS),
    dailyGoalMinutes: z.number().int().min(5).max(240),
    timezone: timezoneSchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type UpdateProfileRequest = z.infer<typeof updateProfileSchema>;

/**
 * Onboarding, submitted once.
 *
 * Everything here is a deliberate answer: level and target set the tutor's
 * voice, the daily goal sets what a mission asks for, and the reminder hour is
 * the only time we are allowed to interrupt the learner's day.
 */
export const onboardingRequestSchema = z.object({
  level: z.enum(CEFR_LEVELS),
  targetLevel: z.enum(CEFR_LEVELS),
  targetExam: z.enum(TARGET_EXAMS).default('NONE'),
  dailyGoalMinutes: z.number().int().min(5).max(240),
  timezone: timezoneSchema,
  reminderHour: z.number().int().min(0).max(23).default(19),
});
export type OnboardingRequest = z.infer<typeof onboardingRequestSchema>;

/**
 * How hard Mocha pushes.
 *
 * A setting rather than a constant because the right answer differs per person
 * and per week — and because a learner who cannot turn the nagging down turns
 * the whole app off instead.
 */
export const NAG_LEVELS = ['LOW', 'NORMAL', 'AGGRESSIVE'] as const;
export type NagLevel = (typeof NAG_LEVELS)[number];

/** Nudges per day at each level, including the mission reminder. */
export const NAGS_PER_DAY: Record<NagLevel, number> = { LOW: 1, NORMAL: 2, AGGRESSIVE: 4 };

export const accountabilitySchema = z.object({
  enabled: z.boolean(),
  intensity: z.enum(NAG_LEVELS),
  /** Minutes of real study below which the day counts as missed. */
  minMinutes: z.number().int().min(5).max(240),
  /** Local hour after which a missed day is final. */
  cutoffHour: z.number().int().min(12).max(23),
  emailEnabled: z.boolean(),
  email: z.string().email().or(z.literal('')),
});
export type AccountabilitySettings = z.infer<typeof accountabilitySchema>;

export const userSettingsSchema = z.object({
  petEnabled: z.boolean(),
  petSkin: z.string(),
  notifications: z.object({
    missionReminder: z.boolean(),
    reminderHour: z.number().int().min(0).max(23),
    streakAtRisk: z.boolean(),
    arrivalToast: z.boolean(),
    quietMode: z.boolean(),
  }),
  blockedHosts: z.array(z.string()).max(500),
  accountability: accountabilitySchema,
});
export type UserSettings = z.infer<typeof userSettingsSchema>;

/** Every field optional, including the nested notification toggles — the
 *  settings screen sends the one switch that moved, not the whole object. */
export const updateSettingsSchema = userSettingsSchema
  .partial()
  .extend({
    notifications: userSettingsSchema.shape.notifications.partial().optional(),
    accountability: userSettingsSchema.shape.accountability.partial().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type UpdateSettingsRequest = z.infer<typeof updateSettingsSchema>;

export const meResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    displayName: z.string(),
    timezone: z.string(),
    settings: userSettingsSchema,
  }),
  profile: profileSchema,
});
export type MeResponse = z.infer<typeof meResponseSchema>;
