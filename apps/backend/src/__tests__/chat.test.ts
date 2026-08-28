import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import type { ChatStreamEvent } from '@pet/shared';

let mongo: MongoMemoryServer;
let app: import('express').Express;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  await mongoose.connect(mongo.getUri());
  const { createApp } = await import('../app.js');
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  const db = mongoose.connection.db;
  if (db) for (const c of await db.collections()) await c.deleteMany({});
});

async function token(): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/dev')
    .send({ email: 'learner@example.com', timezone: 'Asia/Tashkent' });
  return res.body.accessToken as string;
}

/** Parses an SSE body into the events it carried. */
function parseStream(body: string): ChatStreamEvent[] {
  return body
    .split('\n\n')
    .map((block) => block.replace(/^data: /, '').trim())
    .filter(Boolean)
    .map((json) => JSON.parse(json) as ChatStreamEvent);
}

/**
 * superagent has no parser registered for text/event-stream and drops the body,
 * so collect the raw stream ourselves.
 */
function collectStream(res: import('supertest').Test) {
  return res.buffer(true).parse((incoming, callback) => {
    let data = '';
    incoming.setEncoding('utf8');
    incoming.on('data', (chunk: string) => {
      data += chunk;
    });
    incoming.on('end', () => callback(null, data));
  });
}

async function say(accessToken: string, text: string, sessionId?: string) {
  const res = await collectStream(
    request(app)
      .post('/api/v1/chat/message')
      .set('authorization', `Bearer ${accessToken}`)
      .send({ text, ...(sessionId ? { sessionId } : {}) }),
  ).expect(200);
  return parseStream(res.body as string);
}

describe('POST /chat/message', () => {
  it('refuses without a token', async () => {
    await request(app).post('/api/v1/chat/message').send({ text: 'hello' }).expect(401);
  });

  it('rejects an empty message before reaching the model', async () => {
    const t = await token();
    const res = await request(app)
      .post('/api/v1/chat/message')
      .set('authorization', `Bearer ${t}`)
      .send({ text: '   ' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('streams the reply as tokens, not one blob', async () => {
    const events = await say(await token(), 'Hello Mocha, how are you today?');
    const tokens = events.filter((e) => e.type === 'token');
    expect(tokens.length).toBeGreaterThan(1);
    expect(events[0]?.type).toBe('open');
    expect(events.at(-1)?.type).toBe('done');
  });

  it('corrects "I goed to school yesterday" and tags the right topic', async () => {
    const events = await say(await token(), 'I goed to school yesterday.');
    const correctionEvent = events.find((e) => e.type === 'corrections');
    expect(correctionEvent).toBeDefined();

    const first = correctionEvent!.type === 'corrections' ? correctionEvent!.corrections[0] : undefined;
    expect(first?.original.toLowerCase()).toBe('goed');
    expect(first?.corrected).toBe('went');
    expect(first?.topicId).toBe('PAST_SIMPLE_IRREGULAR');
  });

  it('stores the mistake so it can feed the weakness ledger', async () => {
    await say(await token(), 'I goed to the park.');
    const mistakes = await mongoose.connection.collection('mistakes').find({}).toArray();
    expect(mistakes).toHaveLength(1);
    expect(mistakes[0]?.topicId).toBe('PAST_SIMPLE_IRREGULAR');
    expect(mistakes[0]?.resolved).toBe(false);
    expect(mistakes[0]?.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('says nothing is wrong when nothing is wrong — it never invents a correction', async () => {
    const events = await say(await token(), 'I went to the park and it was very nice.');
    expect(events.find((e) => e.type === 'corrections')).toBeUndefined();
    const mistakes = await mongoose.connection.collection('mistakes').countDocuments();
    expect(mistakes).toBe(0);
  });

  it('awards XP and reports the running total', async () => {
    const events = await say(await token(), 'I goed home.');
    const done = events.find((e) => e.type === 'done');
    expect(done?.type === 'done' && done.xpAwarded).toBeGreaterThan(0);
    expect(done?.type === 'done' && done.xpTotal).toBe(done?.type === 'done' ? done.xpAwarded : 0);
  });

  it('keeps one conversation across turns when the session id is reused', async () => {
    const t = await token();
    const first = await say(t, 'Hello there.');
    const open = first.find((e) => e.type === 'open');
    const sessionId = open?.type === 'open' ? open.sessionId : '';
    expect(sessionId).toBeTruthy();

    await say(t, 'I like football.', sessionId);

    const convos = await mongoose.connection.collection('conversations').find({}).toArray();
    expect(convos).toHaveLength(1);
    expect(convos[0]?.messages).toHaveLength(4); // two turns, learner + pet each
  });

  it('catches several different mistake shapes', async () => {
    const t = await token();
    const cases: [string, string][] = [
      ['How much books do you have?', 'COUNTABLE_UNCOUNTABLE'],
      ['I am agree with you.', 'VOCABULARY_CHOICE'],
      ['I have 20 years.', 'VOCABULARY_CHOICE'],
      ['He go to work every day.', 'SUBJECT_VERB_AGREEMENT'],
      ['This is more better.', 'COMPARATIVES_SUPERLATIVES'],
    ];
    for (const [text, topic] of cases) {
      const events = await say(t, text);
      const ev = events.find((e) => e.type === 'corrections');
      expect(ev, `expected a correction for: ${text}`).toBeDefined();
      const got = ev!.type === 'corrections' ? ev!.corrections[0]?.topicId : undefined;
      expect(got, `wrong topic for: ${text}`).toBe(topic);
    }
  });
});

describe('GET /chat/sessions/:id', () => {
  it('rehydrates the conversation with its corrections attached', async () => {
    const t = await token();
    const events = await say(t, 'I goed to school.');
    const open = events.find((e) => e.type === 'open');
    const sessionId = open?.type === 'open' ? open.sessionId : '';

    const res = await request(app)
      .get(`/api/v1/chat/sessions/${sessionId}`)
      .set('authorization', `Bearer ${t}`)
      .expect(200);

    expect(res.body.messages).toHaveLength(2);
    expect(res.body.messages[0].role).toBe('user');
    expect(res.body.messages[1].role).toBe('pet');
    expect(res.body.messages[1].corrections[0].topicId).toBe('PAST_SIMPLE_IRREGULAR');
    expect(res.body.level).toBe('A1');
  });

  it('404s for a session that does not exist', async () => {
    const t = await token();
    await request(app)
      .get('/api/v1/chat/sessions/nope')
      .set('authorization', `Bearer ${t}`)
      .expect(404);
  });
});

describe('the daily token budget', () => {
  it('refuses a turn once the budget is spent, before calling the model', async () => {
    const t = await token();
    await say(t, 'Hello.');

    const user = await mongoose.connection.collection('users').findOne({});
    await mongoose.connection
      .collection('dailyusages')
      .updateOne({ userId: user!._id }, { $set: { inputTokens: 10_000_000, outputTokens: 0 } });

    const events = await say(t, 'Hello again.');
    const err = events.find((e) => e.type === 'error');
    expect(err?.type === 'error' && err.code).toBe('AI_BUDGET_EXCEEDED');
  });
});
