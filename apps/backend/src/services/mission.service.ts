import {
  CUSTOM_TASK_XP,
  LEVEL_VOICE,
  MAX_CUSTOM_TASKS_PER_DAY,
  XP_AWARD,
  XP_PER_TASK_TYPE,
  isServerVerified,
  type CefrLevel,
  type GrammarTopic,
  type Mission as MissionView,
  type MissionHistoryEntry,
  type MissionPlan,
  type CustomTaskRequest,
  type MissionTask,
  type Skill,
  type TaskKind,
} from '@pet/shared';
import { Mission, Profile, User, type MissionDoc } from '../models/index.js';
import { getProvider } from '../ai/index.js';
import { templatePlan } from '../ai/offline.js';
import { buildMissionPrompt } from '../ai/prompts/mission.js';
import { assertWithinBudget, recordUsage } from '../ai/budget.js';
import { topWeakTopics } from './memory.service.js';
import { wordsForPrompt } from './vocab.service.js';
import { record } from './analytics.service.js';
import { ensureProfile } from './profile.service.js';
import { AppError } from '../utils/errors.js';
import { localDate, planDayFor } from '../utils/date.js';
import { logger } from '../config/logger.js';

/** Paid once, on top of the task XP, when every task in a day is done. */
export const COMPLETION_BONUS = XP_AWARD.MISSION_COMPLETED;

/** Skill points for finishing one task. Ninety days of missions reaches 100. */
const SKILL_GAIN = 2;

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
    case 'usewords':
      // Overridden at creation from how many words are actually on the list.
      return 3;
    case 'write':
    case 'listen':
    case 'speak':
    case 'own':
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
    ...(task.words?.length ? { words: [...task.words] } : {}),
    ...(task.usedWords?.length ? { usedWords: [...task.usedWords] } : {}),
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
    // The same daily ceiling the tutor obeys. Over budget is not an error here:
    // it is a reason to hand out the template day rather than nothing at all.
    await assertWithinBudget(userId, today);
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

  const tasks = materialise(plan, {
    level: profile.level,
    dailyGoalMinutes: profile.dailyGoalMinutes,
    weakTopic: weak[0]?.topicId ?? null,
  });

  // The learner's own words, if they have asked for any. This task is not the
  // planner's to invent — it exists only because a real list exists.
  const ownWords = await wordsForPrompt(userId, 3);
  if (ownWords.length >= 2) {
    tasks.push({
      id: `usewords-${tasks.length + 1}`,
      kind: 'usewords',
      skill: 'vocabulary',
      title: 'Use your own words',
      detail: `Use these in a message to Mochi: ${ownWords.join(', ')}.`,
      topicId: null,
      words: ownWords,
      usedWords: [],
      target: ownWords.length,
      progress: 0,
      done: false,
      xp: XP_PER_TASK_TYPE.vocabulary,
    });
  }

  const doc = {
    userId: user._id,
    localDate: today,
    planDay,
    level: profile.level,
    title: plan.title,
    focus: plan.focus,
    tasks,
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

  // Finishing a task is the only evidence we have for the skills a chat turn
  // cannot show — nobody can tell from a conversation whether the learner read
  // for ten minutes or said a sentence out loud, but finishing that task says
  // they did. The clamp is a second update because $inc and $min cannot touch
  // the same field in one.
  const skillBumps: Record<string, number> = {};
  for (const task of completed) {
    skillBumps[`skills.${task.skill}`] = (skillBumps[`skills.${task.skill}`] ?? 0) + SKILL_GAIN;
  }
  await Profile.updateOne({ userId: mission.userId }, { $inc: { xp, ...skillBumps } });
  await Profile.updateOne(
    { userId: mission.userId },
    { $min: Object.fromEntries(Object.keys(skillBumps).map((key) => [key, 100])) },
  );

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
  /** Words from the learner's own list that appeared in this message. */
  usedWords: string[];
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

  // A word only counts once for the day: saying "commute" five times in one
  // afternoon is one word practised, not five.
  const wordTask = mission.tasks.find((t) => t.kind === 'usewords' && !t.done);
  const freshWords = wordTask
    ? signals.usedWords.filter(
        (word) => !(wordTask.usedWords ?? []).some((seen) => seen.toLowerCase() === word.toLowerCase()),
      )
    : [];
  if (wordTask && freshWords.length > 0) {
    wordTask.usedWords = [...(wordTask.usedWords ?? []), ...freshWords];
  }

  return applyProgress(
    mission,
    (task) => {
      switch (task.kind) {
        case 'chat':
          return 1;
        case 'vocab':
          return signals.vocabLearned;
        case 'usewords':
          return freshWords.length;
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

/**
 * A task the learner set themselves.
 *
 * Capped at two a day and worth less than a planned task, for one reason: it
 * is the only task in the system nobody checks. An uncapped self-set task with
 * full XP is not a plan, it is a text box that prints levels.
 */
export async function addCustomTask(
  userId: string,
  input: CustomTaskRequest,
): Promise<MissionDoc> {
  const mission = await todayMission(userId);

  const own = mission.tasks.filter((task) => task.kind === 'own');
  if (own.length >= MAX_CUSTOM_TASKS_PER_DAY) {
    throw AppError.forbidden(
      `Two of your own tasks a day is the limit. Finish these first, or add more tomorrow.`,
    );
  }

  mission.tasks.push({
    id: `own-${Date.now().toString(36)}`,
    kind: 'own',
    skill: input.skill ?? 'writing',
    title: input.title,
    detail: input.detail && input.detail.length > 0 ? input.detail : 'Set by you.',
    topicId: null,
    target: 1,
    progress: 0,
    done: false,
    xp: CUSTOM_TASK_XP,
  });

  // Adding a task to a finished day reopens it; otherwise the new task could
  // never be completed and the day would show as done with work outstanding.
  if (mission.status === 'complete') {
    mission.status = 'active';
    mission.completedAt = null;
  }

  await mission.save();
  return mission;
}

export async function removeCustomTask(userId: string, taskId: string): Promise<MissionDoc> {
  const user = await User.findById(userId).select('timezone').lean();
  if (!user) throw AppError.notFound('That account no longer exists.');

  const mission = await Mission.findOne({ userId, localDate: localDate(user.timezone) });
  if (!mission) throw AppError.notFound('There is no mission for today yet.');

  const task = mission.tasks.find((t) => t.id === taskId);
  if (!task) throw AppError.notFound('That task is not part of today.');
  if (task.kind !== 'own') throw AppError.forbidden('Only a task you added yourself can be removed.');
  // XP already paid is not clawed back; deleting a finished task would let a
  // learner keep the XP and hide the evidence.
  if (task.done) throw AppError.forbidden('That one is already done — it stays.');

  task.deleteOne();
  await mission.save();
  return mission;
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
