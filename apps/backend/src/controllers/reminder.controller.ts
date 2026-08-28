import type { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import type { CreateReminderRequest, Reminder as ReminderView } from '@pet/shared';
import { Reminder } from '../models/index.js';
import { userIdOf } from '../middleware/auth.js';
import { AppError } from '../utils/errors.js';
import { nowFor } from '../services/action.service.js';

function toView(doc: {
  _id: Types.ObjectId;
  title: string;
  dueAtLocal: string;
  delivered: boolean;
  createdAt: Date;
}): ReminderView {
  return {
    id: doc._id.toString(),
    title: doc.title,
    dueAtLocal: doc.dueAtLocal,
    delivered: doc.delivered,
    createdAt: doc.createdAt.toISOString(),
  };
}

/**
 * Everything still waiting, plus anything already due.
 *
 * The extension asks for this on a timer and decides what to show — the server
 * does not push, because there is nowhere to push to when the browser is shut.
 */
export async function getReminders(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = userIdOf(req);
    const rows = await Reminder.find({ userId: new Types.ObjectId(userId), delivered: false })
      .sort({ dueAtLocal: 1 })
      .limit(50)
      .lean();
    res.json({ reminders: rows.map(toView) });
  } catch (err) {
    next(err);
  }
}

export async function postReminder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = userIdOf(req);
    const body = req.body as CreateReminderRequest;
    const now = await nowFor(userId);
    if (body.dueAtLocal.slice(0, 10) < now.date) {
      throw AppError.validation(undefined, 'That time has already passed.');
    }
    const doc = await Reminder.create({
      userId: new Types.ObjectId(userId),
      title: body.title,
      dueAtLocal: body.dueAtLocal,
    });
    res.status(201).json({ reminder: toView(doc) });
  } catch (err) {
    next(err);
  }
}

/** Marked by whichever surface actually showed it, so it is never shown twice. */
export async function postDelivered(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id;
    if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) {
      throw AppError.notFound('That reminder is gone.');
    }
    await Reminder.updateOne(
      { _id: id, userId: new Types.ObjectId(userIdOf(req)) },
      { $set: { delivered: true, deliveredAt: new Date() } },
    );
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function deleteReminder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id;
    if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) {
      throw AppError.notFound('That reminder is gone.');
    }
    await Reminder.deleteOne({ _id: id, userId: new Types.ObjectId(userIdOf(req)) });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
