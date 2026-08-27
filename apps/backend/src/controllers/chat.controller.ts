import type { NextFunction, Request, Response } from 'express';
import type { ChatMessageRequest, ChatStreamEvent } from '@pet/shared';
import { runTurn, getSession } from '../services/tutor.service.js';
import { userIdOf } from '../middleware/auth.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../config/logger.js';

/**
 * Server-sent events. The extension's service worker holds this connection and
 * forwards chunks to whichever surface asked — which also keeps the MV3 worker
 * alive for the duration of the reply.
 */
export async function message(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { sessionId, text } = req.body as ChatMessageRequest;

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });

  const emit = (event: ChatStreamEvent) => {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // A learner who closes the pet mid-reply should stop costing us money.
  //
  // This must listen on `res`, not `req`: an IncomingMessage emits 'close' as
  // soon as its body has been fully read, which for a POST is immediately —
  // listening there suppresses every token before the first one is written.
  // `res` emits 'close' when the connection goes away; if we ended it
  // ourselves, writableEnded is already true and it was not an abort.
  let aborted = false;
  res.on('close', () => {
    if (!res.writableEnded) aborted = true;
  });

  try {
    await runTurn({
      userId: userIdOf(req),
      sessionId,
      text,
      emit: (event) => {
        if (!aborted) emit(event);
      },
    });
  } catch (err) {
    // Headers are already sent, so the error must travel inside the stream —
    // the normal error middleware cannot help us here.
    const e = err instanceof AppError ? err : null;
    if (!e) logger.error({ err }, 'chat stream failed');
    emit({
      type: 'error',
      code: e?.code ?? 'INTERNAL',
      message: e?.message ?? 'Something went wrong. Try again.',
    });
  } finally {
    if (!res.writableEnded) res.end();
  }

  // `next` is unused deliberately: this response is already finished.
  void next;
}

export async function session(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Express 5 types a route param as string | string[]; a repeated param
    // is a malformed URL here, not something to guess at.
    const id = req.params.id;
    if (typeof id !== 'string' || !id) throw AppError.notFound('That conversation is gone.');
    res.json(await getSession(userIdOf(req), id));
  } catch (err) {
    next(err);
  }
}
