import { Types } from 'mongoose';
import { XP_AWARD, type StudySession as StudySessionView } from '@pet/shared';
import { Profile, StudySession, User, type StudySessionDoc } from '../models/index.js';
import { record } from './analytics.service.js';
import { recordMinutes } from './mission.service.js';
import { AppError } from '../utils/errors.js';
import { localDate } from '../utils/date.js';

/** A session left running overnight is somebody who forgot, not somebody who studied. */
const MAX_SESSION_MINUTES = 240;

function toView(doc: StudySessionDoc): StudySessionView {
  return {
    id: doc._id.toString(),
    subject: doc.subject,
    startedAt: doc.startedAt.toISOString(),
    endedAt: doc.endedAt ? doc.endedAt.toISOString() : null,
    minutes: doc.minutes,
    plannedMinutes: doc.plannedMinutes,
  };
}

export async function activeSession(userId: string): Promise<StudySessionView | null> {
  const doc = await StudySession.findOne({ userId: new Types.ObjectId(userId), endedAt: null }).sort({
    startedAt: -1,
  });
  return doc ? toView(doc) : null;
}

/** Starting twice is not two sessions — it is somebody pressing the button again. */
export async function startSession(
  userId: string,
  input: { subject: string; plannedMinutes: number },
): Promise<StudySessionView> {
  const user = await User.findById(userId).select('timezone').lean();
  if (!user) throw AppError.notFound('That account no longer exists.');

  const running = await StudySession.findOne({ userId: new Types.ObjectId(userId), endedAt: null });
  if (running) return toView(running);

  const doc = await StudySession.create({
    userId: new Types.ObjectId(userId),
    subject: input.subject,
    localDate: localDate(user.timezone),
    startedAt: new Date(),
    plannedMinutes: input.plannedMinutes,
  });
  return toView(doc);
}

export interface EndedSession {
  session: StudySessionView;
  xpAwarded: number;
}

/**
 * Ends the running session and pays for the minutes actually spent.
 *
 * The minutes go through the same client-event path as any other practice, so
 * a study session can finish a `read` task and move the day forward — one
 * definition of "minutes practised", not two.
 */
export async function endSession(userId: string): Promise<EndedSession> {
  const user = await User.findById(userId).select('timezone').lean();
  if (!user) throw AppError.notFound('That account no longer exists.');

  const doc = await StudySession.findOne({ userId: new Types.ObjectId(userId), endedAt: null }).sort({
    startedAt: -1,
  });
  if (!doc) throw AppError.notFound('No study session is running.');

  const endedAt = new Date();
  const raw = Math.round((endedAt.getTime() - doc.startedAt.getTime()) / 60_000);
  const minutes = Math.max(0, Math.min(MAX_SESSION_MINUTES, raw));

  doc.endedAt = endedAt;
  doc.minutes = minutes;
  await doc.save();

  const today = localDate(user.timezone);
  let xpAwarded = 0;

  if (minutes > 0) {
    record(doc.userId, 'practice.minutes', today, minutes);
    // A finished block is worth a task's XP; a two-minute one is not.
    xpAwarded = minutes >= 5 ? XP_AWARD.TASK_COMPLETED : 0;
    if (xpAwarded > 0) {
      await Profile.updateOne({ userId: doc.userId }, { $inc: { xp: xpAwarded } });
      record(doc.userId, 'xp.awarded', today, xpAwarded);
    }
    const mission = await recordMinutes(userId, today, minutes);
    xpAwarded += mission.xpAwarded;
  }

  return { session: toView(doc), xpAwarded };
}

/** Minutes studied today, from sessions alone — used by the accountability check. */
export async function minutesToday(userId: string, localDateStr: string): Promise<number> {
  const rows = await StudySession.aggregate<{ total: number }>([
    { $match: { userId: new Types.ObjectId(userId), localDate: localDateStr } },
    { $group: { _id: null, total: { $sum: '$minutes' } } },
  ]);
  return rows[0]?.total ?? 0;
}
