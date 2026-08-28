import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import {
  NOTION_TARGETS,
  TOPIC_LABEL,
  type GrammarTopic,
  type NotionStatus,
  type NotionSyncResult,
  type NotionTarget,
} from '@pet/shared';
import {
  Mission,
  Mistake,
  NotionConnection,
  User,
  VocabItem,
  type NotionConnectionDoc,
} from '../models/index.js';
import { getNotionClient, type NotionPropertyValue } from './notion/client.js';
import { env, notionConfigured } from '../config/env.js';
import { seal, unseal } from '../utils/crypto.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../config/logger.js';

/** How many rows one sync pushes per target. A first sync of a heavy user
 *  should take a few presses rather than one very long request. */
const PAGE_SIZE = 40;

const STATE_TTL_SECONDS = 600;
const STATE_PURPOSE = 'notion-oauth';

function requireConfigured(): void {
  if (!notionConfigured) {
    throw new AppError(
      400,
      'NOTION_NOT_CONNECTED',
      'Notion is not set up on this server. Add NOTION_CLIENT_ID and NOTION_CLIENT_SECRET.',
    );
  }
  if (!env.ENCRYPTION_KEY) {
    throw new AppError(
      400,
      'NOTION_NOT_CONNECTED',
      'ENCRYPTION_KEY is not set, so a Notion token could not be stored safely.',
    );
  }
}

/**
 * The OAuth `state`.
 *
 * A signed, short-lived JWT rather than a row in a table: it has to survive a
 * round trip through Notion and come back proving *which learner* started the
 * flow, and it must not be usable twice a week later. Signing it means no
 * cleanup job and no state table to leak.
 */
function signState(userId: string): string {
  return jwt.sign({ sub: userId, purpose: STATE_PURPOSE }, env.JWT_SECRET, {
    expiresIn: STATE_TTL_SECONDS,
  });
}

function verifyState(state: string): string {
  try {
    const decoded = jwt.verify(state, env.JWT_SECRET);
    if (typeof decoded === 'string' || decoded.purpose !== STATE_PURPOSE || !decoded.sub) {
      throw new Error('malformed');
    }
    return String(decoded.sub);
  } catch {
    throw AppError.validation(undefined, 'That Notion link expired. Start the connection again.');
  }
}

export function authorizeUrl(userId: string): string {
  requireConfigured();
  const url = new URL('https://api.notion.com/v1/oauth/authorize');
  url.searchParams.set('client_id', env.NOTION_CLIENT_ID ?? '');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('owner', 'user');
  url.searchParams.set('redirect_uri', env.NOTION_REDIRECT_URI ?? '');
  url.searchParams.set('state', signState(userId));
  return url.toString();
}

export async function completeConnection(code: string, state: string): Promise<{ workspaceName: string | null }> {
  requireConfigured();
  const userId = verifyState(state);

  const user = await User.findById(userId).select('_id').lean();
  if (!user) throw AppError.notFound('That account no longer exists.');

  const result = await getNotionClient().exchangeCode(code, env.NOTION_REDIRECT_URI ?? '');

  await NotionConnection.updateOne(
    { userId: new Types.ObjectId(userId) },
    {
      $set: {
        accessToken: seal(result.accessToken),
        workspaceId: result.workspaceId,
        workspaceName: result.workspaceName,
        botId: result.botId,
        lastError: null,
      },
      // Databases are created lazily on the first sync, when we know which page
      // the learner actually shared with us.
      $setOnInsert: { databases: { vocabulary: null, mistakes: null, missions: null } },
    },
    { upsert: true },
  );

  return { workspaceName: result.workspaceName };
}

export async function disconnect(userId: string): Promise<void> {
  // Deleted, not flagged: keeping a revoked workspace's sealed token is a
  // liability with no product value.
  await NotionConnection.deleteOne({ userId: new Types.ObjectId(userId) });
}

async function pendingCounts(userId: string): Promise<NotionStatus['pendingCounts']> {
  const id = new Types.ObjectId(userId);
  const [vocabulary, mistakes, missions] = await Promise.all([
    VocabItem.countDocuments({ userId: id, notionPageId: null }),
    Mistake.countDocuments({ userId: id, notionPageId: null }),
    Mission.countDocuments({ userId: id, notionPageId: null, status: 'complete' }),
  ]);
  return { vocabulary, mistakes, missions };
}

export async function status(userId: string): Promise<NotionStatus> {
  const connection = await NotionConnection.findOne({ userId: new Types.ObjectId(userId) }).lean();
  const pending = await pendingCounts(userId);

  return {
    configured: notionConfigured && Boolean(env.ENCRYPTION_KEY),
    connected: Boolean(connection),
    workspaceName: connection?.workspaceName ?? null,
    parentPageTitle: connection?.parentPageTitle ?? null,
    databases: {
      vocabulary: connection?.databases?.vocabulary ?? null,
      mistakes: connection?.databases?.mistakes ?? null,
      missions: connection?.databases?.missions ?? null,
    },
    lastSyncedAt: connection?.lastSyncedAt ? connection.lastSyncedAt.toISOString() : null,
    pendingCounts: pending,
  };
}

// --- the three databases -------------------------------------------------

const DATABASE_TITLE: Record<NotionTarget, string> = {
  vocabulary: 'English · Vocabulary',
  mistakes: 'English · Corrections',
  missions: 'English · Daily missions',
};

const DATABASE_SCHEMA: Record<NotionTarget, Record<string, unknown>> = {
  vocabulary: {
    Word: { title: {} },
    Definition: { rich_text: {} },
    Example: { rich_text: {} },
    Learned: { date: {} },
  },
  mistakes: {
    'You wrote': { title: {} },
    Correction: { rich_text: {} },
    Topic: { select: {} },
    Why: { rich_text: {} },
    Date: { date: {} },
  },
  missions: {
    Mission: { title: {} },
    Day: { number: {} },
    Date: { date: {} },
    Tasks: { rich_text: {} },
    XP: { number: {} },
  },
};

const title = (text: string): NotionPropertyValue => ({
  title: [{ type: 'text', text: { content: trim(text, 200) } }],
});
const richText = (text: string): NotionPropertyValue => ({
  rich_text: [{ type: 'text', text: { content: trim(text, 1900) } }],
});
const date = (isoDate: string): NotionPropertyValue => ({ date: { start: isoDate } });
const number = (value: number): NotionPropertyValue => ({ number: value });
const select = (name: string): NotionPropertyValue => ({ select: { name: trim(name, 100) } });

function trim(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

/**
 * Finds or creates the database for one target.
 *
 * Checked for existence every sync, because the learner can delete a database
 * in Notion at any time and we would otherwise write into a grave forever.
 */
async function ensureDatabase(
  connection: NotionConnectionDoc,
  token: string,
  target: NotionTarget,
): Promise<string> {
  const client = getNotionClient();
  const existing = connection.databases[target];
  if (existing && (await client.databaseExists(token, existing))) return existing;

  if (!connection.parentPageId) {
    const page = await client.firstSharedPage(token);
    if (!page) {
      throw new AppError(
        400,
        'NOTION_SCHEMA_UNMAPPED',
        'Share one Notion page with the integration, then sync again — that page is where your English databases go.',
      );
    }
    connection.parentPageId = page.id;
    connection.parentPageTitle = page.title;
  }

  const id = await client.createDatabase(
    token,
    connection.parentPageId,
    DATABASE_TITLE[target],
    DATABASE_SCHEMA[target],
  );
  connection.databases[target] = id;
  await connection.save();
  return id;
}

/**
 * Pushes new rows to Notion.
 *
 * Idempotent by construction: every row carries the id of the Notion page it
 * became, and only rows without one are sent. A failed sync half way through
 * leaves the rest pending rather than duplicating what already landed.
 */
export async function sync(userId: string, targets: NotionTarget[] = [...NOTION_TARGETS]): Promise<NotionSyncResult> {
  requireConfigured();

  const connection = await NotionConnection.findOne({ userId: new Types.ObjectId(userId) });
  if (!connection) {
    throw new AppError(400, 'NOTION_NOT_CONNECTED', 'Connect Notion first.');
  }

  const token = unseal(connection.accessToken);
  const client = getNotionClient();
  const id = new Types.ObjectId(userId);
  const synced = { vocabulary: 0, mistakes: 0, missions: 0 };

  try {
    if (targets.includes('vocabulary')) {
      const databaseId = await ensureDatabase(connection, token, 'vocabulary');
      const rows = await VocabItem.find({ userId: id, notionPageId: null })
        .sort({ createdAt: 1 })
        .limit(PAGE_SIZE);
      for (const row of rows) {
        const pageId = await client.createPage(token, databaseId, {
          Word: title(row.word),
          Definition: richText(row.definition),
          Example: richText(row.example),
          Learned: date(row.localDate),
        });
        row.notionPageId = pageId || 'synced';
        await row.save();
        synced.vocabulary++;
      }
    }

    if (targets.includes('mistakes')) {
      const databaseId = await ensureDatabase(connection, token, 'mistakes');
      const rows = await Mistake.find({ userId: id, notionPageId: null })
        .sort({ createdAt: 1 })
        .limit(PAGE_SIZE);
      for (const row of rows) {
        const pageId = await client.createPage(token, databaseId, {
          'You wrote': title(row.original),
          Correction: richText(row.corrected),
          Topic: select(TOPIC_LABEL[row.topicId as GrammarTopic] ?? row.topicId),
          Why: richText(row.explanation),
          Date: date(row.localDate),
        });
        row.notionPageId = pageId || 'synced';
        await row.save();
        synced.mistakes++;
      }
    }

    if (targets.includes('missions')) {
      const databaseId = await ensureDatabase(connection, token, 'missions');
      // Only finished days: an exported half-done mission would never be
      // updated, and a stale row is worse than a missing one.
      const rows = await Mission.find({ userId: id, notionPageId: null, status: 'complete' })
        .sort({ localDate: 1 })
        .limit(PAGE_SIZE);
      for (const row of rows) {
        const pageId = await client.createPage(token, databaseId, {
          Mission: title(row.title),
          Day: number(row.planDay),
          Date: date(row.localDate),
          Tasks: richText(row.tasks.map((t) => `• ${t.title}`).join('  ')),
          XP: number(row.xpAwarded),
        });
        row.notionPageId = pageId || 'synced';
        await row.save();
        synced.missions++;
      }
    }
  } catch (err) {
    connection.lastError = err instanceof Error ? err.message : String(err);
    await connection.save();
    logger.warn({ err, userId }, 'notion sync failed');
    throw err;
  }

  const lastSyncedAt = new Date();
  connection.lastSyncedAt = lastSyncedAt;
  connection.lastError = null;
  await connection.save();

  return { synced, lastSyncedAt: lastSyncedAt.toISOString() };
}
