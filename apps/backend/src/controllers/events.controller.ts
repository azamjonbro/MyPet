import type { NextFunction, Request, Response } from 'express';
import { User } from '../models/index.js';
import { record } from '../services/analytics.service.js';
import { recordMinutes } from '../services/mission.service.js';
import { userIdOf } from '../middleware/auth.js';
import { localDate } from '../utils/date.js';
import { AppError } from '../utils/errors.js';
import type { ClientEventBatch } from '@pet/shared';

/**
 * Client-reported events, batched.
 *
 * The client may only report things it is the authority on — how long a reading
 * timer ran, for instance. It can never report XP: that is computed server-side
 * precisely because a client can lie about it.
 */
export async function ingest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = userIdOf(req);
    const user = await User.findById(userId).select('timezone').lean();
    if (!user) throw AppError.notFound('That account no longer exists.');

    const today = localDate(user.timezone);
    const { events } = req.body as ClientEventBatch;

    let minutes = 0;
    for (const event of events) {
      record(userId, event.type, today, event.value);
      if (event.type === 'practice.minutes') minutes += event.value;
    }

    // Minutes are the one thing a `read` task can be measured in, so a batch
    // of them may finish one. Unlike the events themselves this is awaited:
    // it awards XP, and XP that arrives silently later is a bug report.
    const mission = await recordMinutes(userId, today, minutes);

    res.status(202).json({
      accepted: events.length,
      xpAwarded: mission.xpAwarded,
      missionCompleted: mission.missionCompleted,
    });
  } catch (err) {
    next(err);
  }
}
