import { z } from 'zod';

/**
 * What the tutor is allowed to *ask* the application to do.
 *
 * The model never executes anything. It returns one of these, the server
 * validates it against the learner's own state, and the server performs the
 * action — or refuses it. That boundary is the whole safety story: a prompt
 * injection on a web page can, at worst, cause a badly-worded task to be
 * written into that learner's own day.
 *
 * The shape is deliberately flat rather than a discriminated union. Strict
 * structured output does not do `anyOf` well, and a flat object with nullable
 * fields is both easier for the model to fill and easier to validate.
 */
export const AI_ACTIONS = [
  'NONE',
  'CREATE_TASK',
  'CREATE_REMINDER',
  'START_STUDY',
  'END_STUDY',
  'ADD_WORDS',
] as const;
export type AiActionType = (typeof AI_ACTIONS)[number];

export const aiActionSchema = z.object({
  type: z.enum(AI_ACTIONS),
  /** Task title, reminder text, or the subject of a study session. */
  title: z.string().max(90).nullable(),
  /**
   * When a reminder is due, as a local wall-clock time the learner said:
   * "YYYY-MM-DDTHH:mm". Never a timezone-bearing timestamp — the learner said
   * "seven", and seven means seven where they are.
   */
  dueAtLocal: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Expected YYYY-MM-DDTHH:mm')
    .nullable(),
  /** Study length in minutes, when the learner named one. */
  minutes: z.number().int().min(1).max(240).nullable(),
  /** Words to add to the learner's list. */
  words: z.array(z.string().min(1).max(60)).max(15).nullable(),
});
export type AiAction = z.infer<typeof aiActionSchema>;

/** What actually happened, which is not always what was asked for. */
export const actionResultSchema = z.object({
  type: z.enum(AI_ACTIONS),
  ok: z.boolean(),
  /** One short line, already in the learner's voice, safe to show as-is. */
  message: z.string(),
});
export type ActionResult = z.infer<typeof actionResultSchema>;

export const reminderSchema = z.object({
  id: z.string(),
  title: z.string(),
  dueAtLocal: z.string(),
  delivered: z.boolean(),
  createdAt: z.string(),
});
export type Reminder = z.infer<typeof reminderSchema>;

export const createReminderSchema = z.object({
  title: z.string().trim().min(1).max(90),
  dueAtLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
});
export type CreateReminderRequest = z.infer<typeof createReminderSchema>;

export const studySessionSchema = z.object({
  id: z.string(),
  subject: z.string(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  minutes: z.number().int().min(0),
  plannedMinutes: z.number().int().min(0),
});
export type StudySession = z.infer<typeof studySessionSchema>;

export const startStudySchema = z.object({
  subject: z.string().trim().min(1).max(60).default('English'),
  plannedMinutes: z.number().int().min(5).max(240).default(30),
});
export type StartStudyRequest = z.infer<typeof startStudySchema>;
