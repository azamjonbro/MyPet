import type { NextFunction, Request, Response } from 'express';
import { NOTION_TARGETS, type NotionSyncRequest, type NotionTarget } from '@pet/shared';
import { authorizeUrl, completeConnection, disconnect, status, sync } from '../services/notion.service.js';
import { userIdOf } from '../middleware/auth.js';
import { AppError } from '../utils/errors.js';

export async function getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await status(userIdOf(req)));
  } catch (err) {
    next(err);
  }
}

export function getConnect(req: Request, res: Response, next: NextFunction): void {
  try {
    res.json({ authorizeUrl: authorizeUrl(userIdOf(req)) });
  } catch (err) {
    next(err);
  }
}

/**
 * Notion redirects a browser here, not the extension.
 *
 * So the reply is a small HTML page rather than JSON — and it is assembled
 * from constants only. Nothing from the query string is ever echoed into it.
 */
export async function callback(req: Request, res: Response): Promise<void> {
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  const state = typeof req.query.state === 'string' ? req.query.state : null;

  if (!code || !state) {
    res.status(400).type('html').send(page('Connection cancelled', 'Nothing was changed. You can close this tab.'));
    return;
  }

  try {
    const { workspaceName } = await completeConnection(code, state);
    res
      .type('html')
      .send(
        page(
          'Notion connected',
          workspaceName
            ? 'Your workspace is linked. Go back to the extension and press Sync.'
            : 'Your workspace is linked. Go back to the extension and press Sync.',
        ),
      );
  } catch (err) {
    const message = err instanceof AppError ? err.message : 'Something went wrong connecting Notion.';
    res.status(400).type('html').send(page('Could not connect', message));
  }
}

export async function postSync(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as NotionSyncRequest;
    const targets: NotionTarget[] = body.targets ?? [...NOTION_TARGETS];
    res.json(await sync(userIdOf(req), targets));
  } catch (err) {
    next(err);
  }
}

export async function postDisconnect(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await disconnect(userIdOf(req));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

function page(heading: string, body: string): string {
  const escape = (text: string) =>
    text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>AI English Pet</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#faf7f2;
       font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#2f2a24}
  .card{max-width:26rem;padding:2rem;text-align:center}
  h1{font-size:1.25rem;margin:0 0 .5rem}
  p{margin:0;color:#6b625a}
  .dog{font-size:2.5rem}
</style></head>
<body><div class="card"><div class="dog">🐕</div><h1>${escape(heading)}</h1><p>${escape(body)}</p></div></body></html>`;
}
