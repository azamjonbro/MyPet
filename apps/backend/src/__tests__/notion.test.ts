import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

// Set before anything imports config/env.ts — the environment is parsed once,
// at first import, so every module below has to be loaded dynamically.
process.env.NOTION_CLIENT_ID = 'test-client-id';
process.env.NOTION_CLIENT_SECRET = 'test-client-secret';
process.env.NOTION_REDIRECT_URI = 'http://localhost:4100/api/v1/notion/callback';

let mongo: MongoMemoryServer;
let app: import('express').Express;
let fake: FakeNotion;

interface CreatedPage {
  databaseId: string;
  properties: Record<string, unknown>;
}

/**
 * A fake Notion. The suite must never reach the real API — not because it
 * would be slow, but because a test that needs someone's workspace is a test
 * nobody can run.
 */
class FakeNotion {
  pages: CreatedPage[] = [];
  databases: string[] = [];
  searches = 0;
  sharedPage: { id: string; title: string } | null = { id: 'page-1', title: 'Learning English' };
  lastCode: string | null = null;

  exchangeCode = async (code: string) => {
    this.lastCode = code;
    return {
      accessToken: 'secret-notion-token',
      workspaceId: 'ws-1',
      workspaceName: "Aziz's Notion",
      botId: 'bot-1',
    };
  };
  firstSharedPage = async () => {
    this.searches++;
    return this.sharedPage;
  };
  createDatabase = async (_t: string, _parent: string, title: string) => {
    const id = `db-${this.databases.length + 1}`;
    this.databases.push(title);
    return id;
  };
  databaseExists = async (_t: string, id: string) => this.databases.length > 0 && id.startsWith('db-');
  createPage = async (_t: string, databaseId: string, properties: Record<string, unknown>) => {
    this.pages.push({ databaseId, properties });
    return `page-${this.pages.length}`;
  };
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  await mongoose.connect(mongo.getUri());
  app = (await import('../app.js')).createApp();

  const { setNotionClient } = await import('../services/notion/client.js');
  fake = new FakeNotion();
  setNotionClient(fake);
});
afterAll(async () => {
  const { setNotionClient } = await import('../services/notion/client.js');
  setNotionClient(null);
  await mongoose.disconnect();
  await mongo.stop();
});
beforeEach(async () => {
  const db = mongoose.connection.db;
  if (db) for (const c of await db.collections()) await c.deleteMany({});
  fake = new FakeNotion();
  const { setNotionClient } = await import('../services/notion/client.js');
  setNotionClient(fake);
});

async function token(): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/dev')
    .send({ email: 'learner@example.com', timezone: 'Asia/Tashkent' });
  return res.body.accessToken as string;
}

function collect(res: import('supertest').Test) {
  return res.buffer(true).parse((incoming, cb) => {
    let data = '';
    incoming.setEncoding('utf8');
    incoming.on('data', (c: string) => { data += c; });
    incoming.on('end', () => cb(null, data));
  });
}

const say = (t: string, text: string) =>
  collect(
    request(app).post('/api/v1/chat/message').set('authorization', `Bearer ${t}`).send({ text }),
  ).expect(200);

/** Walks the whole OAuth dance the way the extension does. */
async function connect(t: string): Promise<void> {
  const { body } = await request(app)
    .get('/api/v1/notion/connect')
    .set('authorization', `Bearer ${t}`)
    .expect(200);

  const state = new URL(body.authorizeUrl as string).searchParams.get('state')!;
  await request(app).get(`/api/v1/notion/callback?code=auth-code&state=${state}`).expect(200);
}

describe('GET /notion/status', () => {
  it('needs a token', async () => {
    await request(app).get('/api/v1/notion/status').expect(401);
  });

  it('reports a server that has credentials but a learner who has not connected', async () => {
    const t = await token();
    const { body } = await request(app)
      .get('/api/v1/notion/status')
      .set('authorization', `Bearer ${t}`)
      .expect(200);

    expect(body.configured).toBe(true);
    expect(body.connected).toBe(false);
    expect(body.workspaceName).toBeNull();
    expect(body.pendingCounts).toEqual({ vocabulary: 0, mistakes: 0, missions: 0 });
  });

  it('counts what is waiting to be exported', async () => {
    const t = await token();
    await say(t, 'I goed to school yesterday.');

    const { body } = await request(app)
      .get('/api/v1/notion/status')
      .set('authorization', `Bearer ${t}`)
      .expect(200);

    expect(body.pendingCounts.mistakes).toBe(1);
    expect(body.pendingCounts.vocabulary).toBe(1);
  });
});

describe('the OAuth flow', () => {
  it('hands back an authorize URL carrying a signed state, not a user id', async () => {
    const t = await token();
    const { body } = await request(app)
      .get('/api/v1/notion/connect')
      .set('authorization', `Bearer ${t}`)
      .expect(200);

    const url = new URL(body.authorizeUrl as string);
    expect(url.host).toBe('api.notion.com');
    expect(url.searchParams.get('client_id')).toBe('test-client-id');
    expect(url.searchParams.get('response_type')).toBe('code');
    // Three dots: it is a JWT, not the raw user id.
    expect(url.searchParams.get('state')!.split('.')).toHaveLength(3);
  });

  it('refuses a callback whose state was not signed by us', async () => {
    const res = await request(app)
      .get('/api/v1/notion/callback?code=auth-code&state=not-a-real-state')
      .expect(400);
    expect(res.text).toContain('Could not connect');
  });

  it('stores the workspace token sealed, never in the clear', async () => {
    const t = await token();
    await connect(t);

    const row = await mongoose.connection.collection('notionconnections').findOne({});
    expect(row).not.toBeNull();
    expect(JSON.stringify(row)).not.toContain('secret-notion-token');
    expect(row!.accessToken).toHaveProperty('ciphertext');
    expect(row!.accessToken).toHaveProperty('iv');
    expect(row!.accessToken).toHaveProperty('tag');

    const { body } = await request(app)
      .get('/api/v1/notion/status')
      .set('authorization', `Bearer ${t}`)
      .expect(200);
    expect(body.connected).toBe(true);
    expect(body.workspaceName).toBe("Aziz's Notion");
  });
});

describe('POST /notion/sync', () => {
  it('refuses before anything is connected', async () => {
    const t = await token();
    const res = await request(app)
      .post('/api/v1/notion/sync')
      .set('authorization', `Bearer ${t}`)
      .send({})
      .expect(400);
    expect(res.body.error.code).toBe('NOTION_NOT_CONNECTED');
  });

  it('creates the databases once and exports the learner\'s own rows', async () => {
    const t = await token();
    await say(t, 'I goed to school yesterday.');
    await connect(t);

    const { body } = await request(app)
      .post('/api/v1/notion/sync')
      .set('authorization', `Bearer ${t}`)
      .send({})
      .expect(200);

    expect(body.synced.mistakes).toBe(1);
    expect(body.synced.vocabulary).toBe(1);
    expect(fake.databases).toHaveLength(3);
    expect(fake.pages).toHaveLength(2);

    const mistake = fake.pages.find((p) => 'You wrote' in p.properties)!;
    expect(JSON.stringify(mistake.properties)).toContain('goed');
  });

  it('is idempotent — a second sync sends nothing twice', async () => {
    const t = await token();
    await say(t, 'I goed to school yesterday.');
    await connect(t);

    await request(app).post('/api/v1/notion/sync').set('authorization', `Bearer ${t}`).send({}).expect(200);
    const pagesAfterFirst = fake.pages.length;

    const { body } = await request(app)
      .post('/api/v1/notion/sync')
      .set('authorization', `Bearer ${t}`)
      .send({})
      .expect(200);

    expect(body.synced).toEqual({ vocabulary: 0, mistakes: 0, missions: 0 });
    expect(fake.pages).toHaveLength(pagesAfterFirst);
    expect(fake.databases).toHaveLength(3); // not recreated
  });

  it('syncs only the targets it was asked for', async () => {
    const t = await token();
    await say(t, 'I goed to school yesterday.');
    await connect(t);

    const { body } = await request(app)
      .post('/api/v1/notion/sync')
      .set('authorization', `Bearer ${t}`)
      .send({ targets: ['vocabulary'] })
      .expect(200);

    expect(body.synced.vocabulary).toBe(1);
    expect(body.synced.mistakes).toBe(0);
    expect(fake.databases).toEqual(['English · Vocabulary']);
  });

  it('says what to do when no page has been shared with the integration', async () => {
    const t = await token();
    await say(t, 'I goed to school yesterday.');
    await connect(t);
    fake.sharedPage = null;

    const res = await request(app)
      .post('/api/v1/notion/sync')
      .set('authorization', `Bearer ${t}`)
      .send({})
      .expect(400);

    expect(res.body.error.code).toBe('NOTION_SCHEMA_UNMAPPED');
    expect(res.body.error.message).toContain('Share one Notion page');
  });
});

describe('POST /notion/disconnect', () => {
  it('deletes the connection rather than flagging it', async () => {
    const t = await token();
    await connect(t);

    await request(app)
      .post('/api/v1/notion/disconnect')
      .set('authorization', `Bearer ${t}`)
      .expect(204);

    expect(await mongoose.connection.collection('notionconnections').countDocuments({})).toBe(0);

    const { body } = await request(app)
      .get('/api/v1/notion/status')
      .set('authorization', `Bearer ${t}`)
      .expect(200);
    expect(body.connected).toBe(false);
  });
});
