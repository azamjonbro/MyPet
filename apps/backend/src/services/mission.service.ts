import {
  LEVEL_VOICE,
  XP_AWARD,
  XP_PER_TASK_TYPE,
  isServerVerified,
  type CefrLevel,
  type GrammarTopic,
  type Mission as MissionView,
  type MissionHistoryEntry,
  type MissionPlan,
  type MissionTask,
  type Skill,
  type TaskKind,
} from '@pet/shared';
import { Mission, Profile, User, type MissionDoc } from '../models/index.js';
import { getProvider } from '../ai/index.js';
import { templatePlan } from '../ai/offline.js';
import { buildMissionPrompt } from '../ai/prompts/mission.js';
import { recordUsage } from '../ai/budget.js';
import { topWeakTopics } from './memory.service.js';
import { record } from './analytics.service.js';
import { ensureProfile } from './profile.service.js';
import { AppError } from '../utils/errors.js';
import { localDate, planDayFor } from '../utils/date.js';
import { logger } from '../config/logger.js';

/** Paid once, on top of the task XP, when every task in a day is done. */
export const COMPLETION_BONUS = XP_AWARD.MISSION_COMPLETED;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(n)));

/**
 * How much of each kind of task counts as a day's work.
 *
 * Targets are assigned here rather than by the planner, for the same reason XP
 * is: the model proposes what to practise, the server decides what finishing
 * means. Otherwise "chat with Mochi 40 times" is one bad generation away.
 */
function targetFor(kind: TaskKind, level: CefrLevel, dailyGoalMinutes: number): number {
  switch (kind) {
    case 'chat':
      return clamp(dailyGoalMinutes / 6, 3, 10);
    case 'vocab':
      return clamp(LEVEL_VOICE[level].newWordsPerTurn + 1, 2, 6);
    case 'fix':
      return 3;
    case 'read':
      return clamp(dailyGoalMinutes / 3, 5, 30);
    case 'write':
    case 'speak':
      return 1;
  }
}

function materialise(
  plan: MissionPlan,
  opts: { level: CefrLevel; dailyGoalMinutes: number; weakTopic: GrammarTopic | null },
): MissionTask[] {
  return plan.tasks.map((task, index) => ({
    id: `${task.kind}-${index + 1}`,
    kind: task.kind,
    skill: task.skill,
    title: task.title,
    detail: task.detail,
    topicId: task.kind === 'fix' ? opts.weakTopic : null,
    target: targetFor(task.kind, opts.level, opts.dailyGoalMinutes),
    progress: 0,
    done: false,
    xp: XP_PER_TASK_TYPE[task.skill as Skill],
  }));
}

function taskView(task: MissionDoc['tasks'][number]): MissionTask {
  return {
    id: task.id,
    kind: task.kind as TaskKind,
    skill: task.skill as Skill,
    title: task.title,
    detail: task.detail,
    topicId: (task.topicId as GrammarTopic | null) ?? null,
    target: task.target,
    progress: task.progress,
    done: task.done,
    xp: task.xp,
  };
}

export function toMissionView(doc: MissionDoc): MissionView {
  return {
    localDate: doc.localDate,
    planDay: doc.planDay,
    level: doc.level as CefrLevel,
    title: doc.title,
    focus: doc.focus,
    tasks: doc.tasks.map(taskView),
    status: doc.status as 'active' | 'complete',
    completedAt: doc.completedAt ? doc.completedAt.toISOString() : null,
    xpAwarded: doc.xpAwarded,
    source: doc.source as 'ai' | 'template',
  };
}

/**
 * Today's mission, generated on first read.
 *
 * Generation is a nightly job in most products of this shape. It is not one
 * here because a job would have to guess every learner's timezone and would
 * spend tokens planning days nobody opens. The unique index on
 * (userId, localDate) is what makes generate-on-read safe when two surfaces
 * ask at the same moment.
 */
export async function todayMission(userId: string): Promise<MissionDoc> {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('That account no longer exists.');
  const profile = await ensureProfile(user._id);

  const today = localDate(user.timezone);
  const existing = await Mission.findOne({ userId: user._id, localDate: today });
  if (existing) return existing;

  const planDay = planDayFor(profile.planStartDate ?? null, today);
  const weak = await topWeakTopics(userId, 2);
  const recent = await Mission.find({ userId: user._id })
    .sort({ localDate: -1 })
    .limit(5)
    .select('title')
    .lean();

  const request = {
    systemPrompt: buildMissionPrompt({
      level: profile.level,
      targetLevel: profile.targetLevel,
      targetExam: profile.targetExam,
      planDay,
      dailyGoalMinutes: profile.dailyGoalMinutes,
      weakTopics: weak.map((w) => w.topicId),
      recentTitles: recent.map((m) => m.title),
      displayName: user.displayName,
    }),
    level: profile.level,
    planDay,
    dailyGoalMinutes: profile.dailyGoalMinutes,
    weakTopics: weak.map((w) => w.topicId),
  };

  const provider = getProvider();
  let plan: MissionPlan;
  let source: 'ai' | 'template' = 'template';

  try {
    const result = await provider.planMission(request);
    plan = result.plan;
    source = provider.name === 'offline' ? 'template' : 'ai';
    await recordUsage(userId, today, result.usage);
  } catch (err) {
    // A learner opening the extension on a morning when the model is down
    // should still get a day's work, not an error card.
    logger.warn({ err, provider: provider.name }, 'mission planning failed — using the template');
    plan = templatePlan(request);
  }

  const doc = {
    userId: user._id,
    localDate: today,
    planDay,
    level: profile.level,
    title: plan.title,
    focus: plan.focus,
    tasks: materialise(plan, {
      level: profile.level,
      dailyGoalMinutes: profile.dailyGoalMinutes,
      weakTopic: weak[0]?.topicId ?? null,
    }),
    source,
  };

  try {
    return await Mission.create(doc);
  } catch (err) {
    // Two surfaces asked at once and the other one won. Its mission is as good
    // as ours, and there must only ever be one for the day.
    const raced = await Mission.findOne({ userId: user._id, localDate: today });
    if (raced) return raced;
    throw err;
  }
}

export interface MissionProgress {
  xpAwarded: number;
  completedTasks: MissionTask[];
  missionCompleted: boolean;
}

const NO_PROGRESS: MissionProgress = { xpAwarded: 0, completedTasks: [], missionCompleted: false };

/**
 * Applies deltas to today's mission and settles up: XP for each task that
 * crossed its target, plus the completion bonus if that was the last one.
 *
 * XP is added with an atomic $inc rather than by loading the profile, because
 * the caller usually holds its own copy of that document — a read-modify-write
 * here would silently undo whatever the caller saved.
 */
async function applyProgress(
  mission: MissionDoc,
  advance: (task: MissionTask) => number,
  today: string,
): Promise<MissionProgress> {
  if (mission.status === 'complete') return NO_PROGRESS;

  const completed: MissionTask[] = [];
  let xp = 0;

  for (const task of mission.tasks) {
    if (task.done) continue;
    const delta = advance(taskView(task));
    if (delta <= 0) continue;

    task.progress = Math.min(task.target, task.progress + delta);
    if (task.progress >= task.target) {
      task.done = true;
      xp += task.xp;
      completed.push(taskView(task));
    }
  }

  if (completed.length === 0) {
    if (mission.isModified()) await mission.save();
    return NO_PROGRESS;
  }

  const missionCompleted = mission.tasks.every((t) => t.done);
  if (missionCompleted) {
    xp += COMPLETION_BONUS;
    mission.status = 'complete';
    mission.completedAt = new Date();
  }

  mission.xpAwarded += xp;
  await mission.save();
  await Profile.updateOne({ userId: mission.userId }, { $inc: { xp } });

  for (const task of completed) {
    record(mission.userId, 'mission.task.progress', today, 1, { taskId: task.id, kind: task.kind });
  }
  record(mission.userId, 'xp.awarded', today, xp);
  if (missionCompleted) record(mission.userId, 'mission.completed', today);

  return { xpAwarded: xp, completedTasks: completed, missionCompleted };
}

export interface ChatTurnSignals {
  vocabLearned: number;
  correctedTopics: GrammarTopic[];
}

/**
 * What one tutoring turn is worth to today's mission.
 *
 * A `fix` task advances on a turn where the learner did NOT make that mistake —
 * which is the only honest reading of "get this right today". It deliberately
 * does not advance on a turn that avoided the grammar altogether being
 * indistinguishable from one that used it correctly; three clean turns is a
 * low enough bar that the difference does not matter, and a stricter rule
 * would need the model to certify its own homework.
 */
export async function recordChatTurn(
  userId: string,
  today: string,
  signals: ChatTurnSignals,
): Promise<MissionProgress> {
  const mission = await Mission.findOne({ userId, localDate: today });
  if (!mission) return NO_PROGRESS;

  return applyProgress(
    mission,
    (task) => {
      switch (task.kind) {
        case 'chat':
          return 1;
        case 'vocab':
          return signals.vocabLearned;
        case 'fix':
          return task.topicId === null
            ? signals.correctedTopics.length === 0 ? 1 : 0
            : signals.correctedTopics.includes(task.topicId) ? 0 : 1;
        default:
          return 0;
      }
    },
    today,
  );
}

/** Client-reported practice minutes, which are what a `read` task measures. */
export async function recordMinutes(
  userId: string,
  today: string,
  minutes: number,
): Promise<MissionProgress> {
  if (minutes <= 0) return NO_PROGRESS;
  const mission = await Mission.findOne({ userId, localDate: today });
  if (!mission) return NO_PROGRESS;
  return applyProgress(mission, (task) => (task.kind === 'read' ? minutes : 0), today);
}

/**
 * Marking a task done by hand.
 *
 * Only the kinds nobody but the learner can see — writing something in a
 * notebook, saying a sentence out loud. A task the server verifies is not
 * completable by asking, or the 90-day plan becomes a button you press.
 */
export async function completeTask(
  userId: string,
  taskId: string,
): Promise<{ mission: MissionDoc; progress: MissionProgress }> {
  const user = await User.findById(userId).select('timezone').lean();
  if (!user) throw AppError.notFound('That account no longer exists.');
  const today = localDate(user.timezone);

  const mission = await Mission.findOne({ userId, localDate: today });
  if (!mission) throw AppError.notFound('There is no mission for today yet.');

  const task = mission.tasks.find((t) => t.id === taskId);
  if (!task) throw AppError.notFound('That task is not part of today.');
  if (isServerVerified(task.kind as TaskKind)) {
    throw AppError.forbidden('Mochi ticks this one off for you — keep practising.');
  }
  if (task.done) return { mission, progress: NO_PROGRESS };

  const progress = await applyProgress(
    mission,
    (candidate) => (candidate.id === taskId ? candidate.target : 0),
    today,
  );
  return { mission, progress };
}

export async function missionHistory(userId: string, limit = 14): Promise<MissionHistoryEntry[]> {
  const rows = await Mission.find({ userId })
    .sort({ localDate: -1 })
    .limit(Math.min(90, Math.max(1, limit)))
    .lean();

  return rows.map((m) => ({
    localDate: m.localDate,
    planDay: m.planDay,
    title: m.title,
    status: m.status as 'active' | 'complete',
    tasksDone: m.tasks.filter((t) => t.done).length,
    tasksTotal: m.tasks.length,
    xpAwarded: m.xpAwarded,
  }));
}
