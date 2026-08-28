import type { NextFunction, Request, Response } from 'express';
import {
  COMPLETION_BONUS,
  completeTask,
  missionHistory,
  todayMission,
  toMissionView,
} from '../services/mission.service.js';
import { userIdOf } from '../middleware/auth.js';
import { AppError } from '../utils/errors.js';

export async function getToday(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const mission = await todayMission(userIdOf(req));
    res.json({ mission: toMissionView(mission), completionBonus: COMPLETION_BONUS });
  } catch (err) {
    next(err);
  }
}

export async function postComplete(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const taskId = req.params.taskId;
    if (typeof taskId !== 'string' || !taskId) throw AppError.notFound('That task is not part of today.');

    const { mission, progress } = await completeTask(userIdOf(req), taskId);
    res.json({
      mission: toMissionView(mission),
      xpAwarded: progress.xpAwarded,
      missionCompleted: progress.missionCompleted,
    });
  } catch (err) {
    next(err);
  }
}

export async function getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const raw = req.query.limit;
    const limit = Math.min(90, Math.max(1, Number.parseInt(String(raw ?? '14'), 10) || 14));
    res.json({ missions: await missionHistory(userIdOf(req), limit) });
  } catch (err) {
    next(err);
  }
}
