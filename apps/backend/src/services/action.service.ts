import { Types } from 'mongoose';
import { MAX_CUSTOM_TASKS_PER_DAY, type ActionResult, type AiAction } from '@pet/shared';
import { Reminder, User } from '../models/index.js';
import { addCustomTask } from './mission.service.js';
import { addWords } from './vocab.service.js';
import { endSession, startSession } from './study.service.js';
import { AppError } from '../utils/errors.js';
import { calendarDate } from '../utils/date.js';
import { logger } from '../config/logger.js';

/** Reminders more than this far out are almost always a misread date. */
const MAX_DAYS_AHEAD = 60;

/**
 * Executes what the tutor proposed.
 *
 * Everything the model returns is treated as a *request from the learner*,
 * arriving through an untrusted channel — the learner's message may itself
 * quote a web page. So each action is re-validated here against the learner's
 * own state, and the blast radius of the worst case is a badly-worded task in
 * that one learner's own day. The model never touches the database.
 */
export async function execute(
  userId: string,
  action: AiAction,
  nowLocal: { date: string; timezone: string },
): Promise<ActionResult | null> {
  if (action.type === 'NONE') return null;

  try {
    switch (action.type) {
      case 'CREATE_TASK':
        return await createTask(userId, action);
      case 'CREATE_REMINDER':
        return await createReminder(userId, action, nowLocal);
      case 'START_STUDY':
        return await beginStudy(userId, action);
      case 'END_STUDY':
        return await finishStudy(userId);
      case 'ADD_WORDS':
        return await saveWords(userId, action);
      default:
        return null;
    }
  } catch (err) {
    // A failed action must never fail the reply: the learner still gets their
    // tutoring, plus an honest line about what did not happen.
    if (err instanceof AppError) {
      return { type: action.type, ok: false, message: err.message };
    }
    logger.warn({ err, action: action.type, userId }, 'action failed');
    return { type: action.type, ok: false, message: 'That did not save. Try asking again.' };
  }
}

async function createTask(userId: string, action: AiAction): Promise<ActionResult> {
  const title = action.title?.trim();
  if (!title) {
    return { type: 'CREATE_TASK', ok: false, message: 'What should the task say?' };
  }
  await addCustomTask(userId, { title: title.slice(0, 90) });
  return {
    type: 'CREATE_TASK',
    ok: true,
    message: `Added to today: ${title.slice(0, 60)}`,
  };
}

async function createReminder(
  userId: string,
  action: AiAction,
  nowLocal: { date: string; timezone: string },
): Promise<ActionResult> {
  const title = action.title?.trim();
  if (!title) return { type: 'CREATE_REMINDER', ok: false, message: 'Remind you about what?' };
  if (!action.dueAtLocal) {
    return { type: 'CREATE_REMINDER', ok: false, message: 'What time should I remind you?' };
  }

  // Compared as wall-clock strings, which is the same comparison the scheduler
  // makes later — no timezone maths, and therefore no timezone bugs.
  const nowStamp = `${nowLocal.date}T${currentClock(nowLocal.timezone)}`;
  if (action.dueAtLocal <= nowStamp) {
    return { type: 'CREATE_REMINDER', ok: false, message: 'That time has already passed today.' };
  }
  const daysAhead =
    (Date.parse(`${action.dueAtLocal.slice(0, 10)}T00:00:00Z`) -
      Date.parse(`${nowLocal.date}T00:00:00Z`)) /
    86_400_000;
  if (daysAhead > MAX_DAYS_AHEAD) {
    return { type: 'CREATE_REMINDER', ok: false, message: 'That is too far ahead for a reminder.' };
  }

  await Reminder.create({
    userId: new Types.ObjectId(userId),
    title: title.slice(0, 90),
    dueAtLocal: action.dueAtLocal,
  });

  const [day, time] = action.dueAtLocal.split('T');
  return {
    type: 'CREATE_REMINDER',
    ok: true,
    message: `Reminder set for ${day === nowLocal.date ? 'today' : day} at ${time}.`,
  };
}

async function beginStudy(userId: string, action: AiAction): Promise<ActionResult> {
  const session = await startSession(userId, {
    subject: action.title?.trim() || 'English',
    plannedMinutes: action.minutes ?? 30,
  });
  return {
    type: 'START_STUDY',
    ok: true,
    message: `${session.subject} session started — ${session.plannedMinutes} minutes.`,
  };
}

async function finishStudy(userId: string): Promise<ActionResult> {
  const { session, xpAwarded } = await endSession(userId);
  return {
    type: 'END_STUDY',
    ok: true,
    message:
      session.minutes > 0
        ? `${session.minutes} minutes of ${session.subject} logged${xpAwarded > 0 ? ` · +${xpAwarded} XP` : ''}.`
        : 'Session closed.',
  };
}

async function saveWords(userId: string, action: AiAction): Promise<ActionResult> {
  const words = (action.words ?? []).map((w) => w.trim()).filter(Boolean).slice(0, 15);
  if (words.length === 0) {
    return { type: 'ADD_WORDS', ok: false, message: 'Which words should I add?' };
  }
  await addWords(userId, { words: words.map((word) => ({ word })) });
  return {
    type: 'ADD_WORDS',
    ok: true,
    message: `Added to your words: ${words.slice(0, 5).join(', ')}${words.length > 5 ? '…' : ''}`,
  };
}

/** "HH:mm" in the learner's timezone. */
export function currentClock(timezone: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);
}

/**
 * The learner's own "now", which is what every action is judged against.
 * Calendar date, not the study day: a reminder for 01:30 is tonight.
 */
export async function nowFor(userId: string): Promise<{ date: string; timezone: string }> {
  const user = await User.findById(userId).select('timezone').lean();
  if (!user) throw AppError.notFound('That account no longer exists.');
  return { date: calendarDate(user.timezone), timezone: user.timezone };
}

export { MAX_CUSTOM_TASKS_PER_DAY };
