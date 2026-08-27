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
});
export type UserSettings = z.infer<typeof userSettingsSchema>;

export const updateSettingsSchema = userSettingsSchema.partial();
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
