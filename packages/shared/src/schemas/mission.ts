import { z } from 'zod';
import { CEFR_LEVELS } from '../constants/cefr.js';
import { GRAMMAR_TOPICS, SKILLS } from '../constants/grammarTopics.js';
import { localDateSchema } from './common.js';

/**
 * The daily mission.
 *
 * A task is either something the server can *see* happening — messages sent,
 * words learned, a weak topic used correctly — or something only the learner
 * can attest to, like reading for ten minutes. The two are kept apart on
 * purpose: a task the server verifies must never be completable by asking,
 * because that turns the 90-day plan into a button you press.
 */
export const TASK_KINDS = ['chat', 'vocab', 'fix', 'write', 'read', 'speak'] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

/** Kinds advanced from the server's own event stream. The rest are self-reported. */
export const SERVER_VERIFIED_KINDS = ['chat', 'vocab', 'fix'] as const;

export function isServerVerified(kind: TaskKind): boolean {
  return (SERVER_VERIFIED_KINDS as readonly string[]).includes(kind);
}

export const missionTaskSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(TASK_KINDS),
  skill: z.enum(SKILLS),
  title: z.string().min(1).max(90),
  detail: z.string().min(1).max(300),
  /** Set only on `fix` tasks — which weakness this one is aimed at. */
  topicId: z.enum(GRAMMAR_TOPICS).nullable(),
  target: z.number().int().min(1).max(60),
  progress: z.number().int().min(0),
  done: z.boolean(),
  xp: z.number().int().min(0).max(400),
});
export type MissionTask = z.infer<typeof missionTaskSchema>;

export const missionSchema = z.object({
  localDate: localDateSchema,
  planDay: z.number().int().min(0).max(90),
  level: z.enum(CEFR_LEVELS),
  title: z.string().min(1).max(90),
  focus: z.string().min(1).max(160),
  tasks: z.array(missionTaskSchema).min(1).max(5),
  status: z.enum(['active', 'complete']),
  completedAt: z.string().nullable(),
  xpAwarded: z.number().int().min(0),
  /** Where the plan came from, so a bad day is traceable to the generator. */
  source: z.enum(['ai', 'template']),
});
export type Mission = z.infer<typeof missionSchema>;

export const missionResponseSchema = z.object({
  mission: missionSchema,
  /** Bonus paid on top of the task XP when every task is done. */
  completionBonus: z.number().int().min(0),
});
export type MissionResponse = z.infer<typeof missionResponseSchema>;

export const completeTaskResponseSchema = z.object({
  mission: missionSchema,
  xpAwarded: z.number().int().min(0),
  missionCompleted: z.boolean(),
});
export type CompleteTaskResponse = z.infer<typeof completeTaskResponseSchema>;

/**
 * What the model is allowed to decide.
 *
 * Deliberately not the whole mission: ids, targets and XP are assigned by the
 * server, so a model — or a prompt injection reaching one — cannot mint XP.
 */
export const missionPlanSchema = z.object({
  title: z.string().min(1).max(90),
  focus: z.string().min(1).max(160),
  tasks: z
    .array(
      z.object({
        kind: z.enum(TASK_KINDS),
        skill: z.enum(SKILLS),
        title: z.string().min(1).max(90),
        detail: z.string().min(1).max(300),
      }),
    )
    .min(3)
    .max(4),
});
export type MissionPlan = z.infer<typeof missionPlanSchema>;

export const missionHistoryEntrySchema = z.object({
  localDate: localDateSchema,
  planDay: z.number().int(),
  title: z.string(),
  status: z.enum(['active', 'complete']),
  tasksDone: z.number().int(),
  tasksTotal: z.number().int(),
  xpAwarded: z.number().int(),
});
export type MissionHistoryEntry = z.infer<typeof missionHistoryEntrySchema>;
