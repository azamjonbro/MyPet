import type { NextFunction, Request, Response } from 'express';
import type { AddWordsRequest, UpdateWordRequest } from '@pet/shared';
import { addWords, list, removeWord, updateWord } from '../services/vocab.service.js';
import { userIdOf } from '../middleware/auth.js';
import { AppError } from '../utils/errors.js';

function wordIdOf(req: Request): string {
  const id = req.params.id;
  if (typeof id !== 'string' || !id) throw AppError.notFound('That word is not on your list.');
  return id;
}

export async function getWords(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await list(userIdOf(req)));
  } catch (err) {
    next(err);
  }
}

export async function postWords(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.status(201).json(await addWords(userIdOf(req), req.body as AddWordsRequest));
  } catch (err) {
    next(err);
  }
}

export async function patchWord(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const word = await updateWord(userIdOf(req), wordIdOf(req), req.body as UpdateWordRequest);
    res.json({ word });
  } catch (err) {
    next(err);
  }
}

export async function deleteWord(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await removeWord(userIdOf(req), wordIdOf(req));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
