import { env } from '../../config/env.js';
import { AppError } from '../../utils/errors.js';
import { logger } from '../../config/logger.js';

/**
 * The Notion HTTP client.
 *
 * Written against `fetch` rather than the official SDK for one reason: this
 * uses six endpoints, and a dependency that ships its own HTTP stack, retry
 * policy and type surface for six endpoints is a liability rather than a
 * saving. The interface exists so tests can swap it — the suite must never
 * reach the real API, and a fake here is cheaper than intercepting sockets.
 */
const API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

export interface NotionOAuthResult {
  accessToken: string;
  workspaceId: string | null;
  workspaceName: string | null;
  botId: string | null;
}

export interface NotionPageRef {
  id: string;
  title: string;
}

/** A Notion property value, as the API expects it. Shapes vary per type. */
export type NotionPropertyValue = Record<string, unknown>;

export interface NotionClient {
  exchangeCode(code: string, redirectUri: string): Promise<NotionOAuthResult>;
  /** The first page the learner shared with the integration, or null. */
  firstSharedPage(token: string): Promise<NotionPageRef | null>;
  createDatabase(
    token: string,
    parentPageId: string,
    title: string,
    properties: Record<string, unknown>,
  ): Promise<string>;
  databaseExists(token: string, databaseId: string): Promise<boolean>;
  createPage(
    token: string,
    databaseId: string,
    properties: Record<string, NotionPropertyValue>,
  ): Promise<string>;
}

async function call(
  token: string,
  path: string,
  init: RequestInit & { body?: string } = {},
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'notion-version': NOTION_VERSION,
        ...(init.headers ?? {}),
      },
    });
  } catch (err) {
    logger.warn({ err, path }, 'notion request failed');
    throw new AppError(502, 'UPSTREAM_UNAVAILABLE', 'Notion did not answer. Try again in a moment.');
  }

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    // 401 means the learner revoked us in Notion; that is a reconnect, not a bug.
    if (res.status === 401) {
      throw new AppError(400, 'NOTION_NOT_CONNECTED', 'Notion access was revoked. Connect it again.');
    }
    logger.warn({ status: res.status, path, body }, 'notion rejected a request');
    throw new AppError(
      502,
      'UPSTREAM_UNAVAILABLE',
      typeof body.message === 'string' ? body.message : 'Notion refused that request.',
    );
  }
  return body;
}

export function createNotionClient(): NotionClient {
  return {
    async exchangeCode(code, redirectUri) {
      const basic = Buffer.from(`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`).toString('base64');
      let res: Response;
      try {
        res = await fetch(`${API}/oauth/token`, {
          method: 'POST',
          headers: {
            authorization: `Basic ${basic}`,
            'content-type': 'application/json',
            'notion-version': NOTION_VERSION,
          },
          body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
        });
      } catch (err) {
        logger.warn({ err }, 'notion token exchange failed');
        throw new AppError(502, 'UPSTREAM_UNAVAILABLE', 'Notion did not answer. Try again.');
      }

      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || typeof body.access_token !== 'string') {
        logger.warn({ status: res.status }, 'notion refused the authorization code');
        throw AppError.validation(undefined, 'Notion refused that connection. Try connecting again.');
      }

      return {
        accessToken: body.access_token,
        workspaceId: typeof body.workspace_id === 'string' ? body.workspace_id : null,
        workspaceName: typeof body.workspace_name === 'string' ? body.workspace_name : null,
        botId: typeof body.bot_id === 'string' ? body.bot_id : null,
      };
    },

    async firstSharedPage(token) {
      const body = await call(token, '/search', {
        method: 'POST',
        body: JSON.stringify({
          filter: { value: 'page', property: 'object' },
          page_size: 10,
          sort: { direction: 'descending', timestamp: 'last_edited_time' },
        }),
      });

      const results = Array.isArray(body.results) ? (body.results as Record<string, unknown>[]) : [];
      for (const page of results) {
        // A database row is also an "object: page"; only a real page can be a parent.
        const parent = page.parent as { type?: string } | undefined;
        if (parent?.type === 'database_id') continue;
        const id = typeof page.id === 'string' ? page.id : null;
        if (!id) continue;
        return { id, title: titleOf(page) };
      }
      return null;
    },

    async createDatabase(token, parentPageId, title, properties) {
      const body = await call(token, '/databases', {
        method: 'POST',
        body: JSON.stringify({
          parent: { type: 'page_id', page_id: parentPageId },
          title: [{ type: 'text', text: { content: title } }],
          properties,
        }),
      });
      if (typeof body.id !== 'string') {
        throw new AppError(502, 'UPSTREAM_UNAVAILABLE', 'Notion created something unreadable.');
      }
      return body.id;
    },

    async databaseExists(token, databaseId) {
      try {
        await call(token, `/databases/${databaseId}`, { method: 'GET' });
        return true;
      } catch {
        // A deleted or unshared database is a reason to recreate it, not to fail.
        return false;
      }
    },

    async createPage(token, databaseId, properties) {
      const body = await call(token, '/pages', {
        method: 'POST',
        body: JSON.stringify({ parent: { database_id: databaseId }, properties }),
      });
      return typeof body.id === 'string' ? body.id : '';
    },
  };
}

function titleOf(page: Record<string, unknown>): string {
  const properties = page.properties as Record<string, { title?: { plain_text?: string }[] }> | undefined;
  for (const value of Object.values(properties ?? {})) {
    const text = value.title?.map((t) => t.plain_text ?? '').join('').trim();
    if (text) return text;
  }
  return 'Untitled';
}

let client: NotionClient | null = null;

export function getNotionClient(): NotionClient {
  client ??= createNotionClient();
  return client;
}

/** Test seam, matching the AI provider's. */
export function setNotionClient(next: NotionClient | null): void {
  client = next;
}
