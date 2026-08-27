import { Types } from 'mongoose';
import { DailyStat, Event, type EventType } from '../models/index.js';

/**
 * Recording is fire-and-forget by design: analytics must never be able to fail
 * a learner's turn. A lost event costs a row in a chart; a thrown one would
 * cost the reply.
 */
export function record(
  userId: Types.ObjectId | string,
  type: EventType,
  localDate: string,
  value = 1,
  meta?: Record<string, unknown>,
): void {
  void Event.create({
    userId: typeof userId === 'string' ? new Types.ObjectId(userId) : userId,
    type,
    localDate,
    value,
    ...(meta ? { meta } : {}),
  }).catch(() => {
    /* analytics is not worth an exception */
  });
}

const AGGREGATIONS: Record<EventType, keyof DailyTotals | null> = {
  'chat.message': 'messages',
  'correction.received': 'corrections',
  'vocab.learned': 'wordsLearned',
  'practice.minutes': 'minutes',
  'mission.completed': 'missionsCompleted',
  'xp.awarded': 'xp',
  'mission.task.progress': null,
};

export interface DailyTotals {
  minutes: number;
  messages: number;
  corrections: number;
  wordsLearned: number;
  missionsCompleted: number;
  xp: number;
}

/**
 * Folds raw events into `dailyStats` for one user-day.
 *
 * Idempotent: it recomputes the day from scratch rather than incrementing, so
 * running it twice — or re-running it a month later after adding a metric —
 * produces the same answer.
 */
export async function rollupDay(userId: Types.ObjectId, localDate: string): Promise<DailyTotals> {
  const rows = await Event.aggregate<{ _id: EventType; total: number }>([
    { $match: { userId, localDate } },
    { $group: { _id: '$type', total: { $sum: '$value' } } },
  ]);

  const totals: DailyTotals = {
    minutes: 0, messages: 0, corrections: 0, wordsLearned: 0, missionsCompleted: 0, xp: 0,
  };

  for (const row of rows) {
    const field = AGGREGATIONS[row._id];
    if (field) totals[field] += row.total;
  }

  await DailyStat.updateOne({ userId, localDate }, { $set: totals }, { upsert: true });
  return totals;
}

/** Rolls up every user-day that has events but no matching stat row yet. */
export async function rollupPending(limit = 500): Promise<number> {
  const pending = await Event.aggregate<{ _id: { userId: Types.ObjectId; localDate: string } }>([
    { $group: { _id: { userId: '$userId', localDate: '$localDate' } } },
    { $limit: limit },
  ]);

  let count = 0;
  for (const row of pending) {
    await rollupDay(row._id.userId, row._id.localDate);
    count++;
  }
  return count;
}
