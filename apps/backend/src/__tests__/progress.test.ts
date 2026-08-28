import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

let mongo: MongoMemoryServer;
let app: import('express').Express;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  await mongoose.connect(mongo.getUri());
  app = (await import('../app.js')).createApp();
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

describe('GET /progress/summary', () => {
  it('needs a token', async () => {
    await request(app).get('/api/v1/progress/summary').expect(401);
  });

  it('is a real empty state for a learner who has done nothing', async () => {
    const t = await token();
    const { body } = await request(app)
      .get('/api/v1/progress/summary')
      .set('authorization', `Bearer ${t}`)
      .expect(200);

    expect(body.xp).toBe(0);
    expect(body.level).toBe(1);
    expect(body.title).toBe('First Words');
    expect(body.streak).toEqual({ current: 0, longest: 0, atRisk: false });
    expect(body.today.messages).toBe(0);
    expect(body.skills.grammar).toBe(0);
  });

  it('reflects practice immediately, without waiting for the nightly rollup', async () => {
    const t = await token();
    await say(t, 'I goed to school.');

    const { body } = await request(app)
      .get('/api/v1/progress/summary')
      .set('authorization', `Bearer ${t}`)
      .expect(200);

    expect(body.xp).toBeGreaterThan(0);
    expect(body.today.messages).toBe(1);
    expect(body.today.corrections).toBe(1);
    expect(body.today.xp).toBe(body.xp);
    expect(body.streak.current).toBe(1);
    expect(body.skills.writing).toBeGreaterThan(0);
  });

  it('starts the streak on the first turn and does not double it on the second', async () => {
    const t = await token();
    await say(t, 'Hello.');
    await say(t, 'How are you?');

    const { body } = await request(app)
      .get('/api/v1/progress/summary')
      .set('authorization', `Bearer ${t}`)
      .expect(200);

    expect(body.streak.current).toBe(1);
    expect(body.today.messages).toBe(2);
  });
});

describe('GET /progress/weaknesses', () => {
  it('is empty for a learner with a clean record', async () => {
    const t = await token();
    const { body } = await request(app)
      .get('/api/v1/progress/weaknesses')
      .set('authorization', `Bearer ${t}`)
      .expect(200);
    expect(body.weaknesses).toEqual([]);
  });

  it('ranks topics by how often they go wrong, with the learner\'s own examples', async () => {
    const t = await token();
    await say(t, 'I goed to school.');
    await say(t, 'I goed home.');
    await say(t, 'How much books do you have?');

    const { body } = await request(app)
      .get('/api/v1/progress/weaknesses')
      .set('authorization', `Bearer ${t}`)
      .expect(200);

    expect(body.weaknesses[0].topicId).toBe('PAST_SIMPLE_IRREGULAR');
    expect(body.weaknesses[0].count).toBe(2);
    expect(body.weaknesses[0].label).toBe('Past Simple · irregular verbs');
    expect(body.weaknesses[0].examples[0]).toHaveProperty('original');
    expect(body.weaknesses[1].topicId).toBe('COUNTABLE_UNCOUNTABLE');
  });

  it('feeds the weak topic back into the tutor prompt', async () => {
    const t = await token();
    await say(t, 'I goed to school.');

    // Tier 3 of the memory system is a database query, so this is assertable
    // without going near the model.
    const { topWeakTopics } = await import('../services/memory.service.js');
    const user = await mongoose.connection.collection('users').findOne({});
    const weak = await topWeakTopics(user!._id.toString());
    expect(weak[0]?.topicId).toBe('PAST_SIMPLE_IRREGULAR');

    const { buildSystemPrompt } = await import('../ai/prompts/system.js');
    const prompt = buildSystemPrompt({
      level: 'A1', targetLevel: 'B2', targetExam: 'NONE', currentDay: 1,
      weakTopics: weak.map((w) => w.topicId), recentMistakes: [], summary: null,
      displayName: 'Aziz',
      studyWords: [],
      nowLocal: '2026-08-29T09:00',
    });
    expect(prompt).toContain('Past Simple · irregular verbs');
  });
});

describe('GET /progress/history', () => {
  it('fills missing days with zeroes rather than leaving holes', async () => {
    const t = await token();
    await say(t, 'Hello.');

    const { body } = await request(app)
      .get('/api/v1/progress/history?days=7')
      .set('authorization', `Bearer ${t}`)
      .expect(200);

    expect(body.days).toHaveLength(7);
    expect(body.days.every((d: { localDate: string }) => /^\d{4}-\d{2}-\d{2}$/.test(d.localDate))).toBe(true);
    expect(body.days.at(-1).messages).toBe(1);
    expect(body.days[0].messages).toBe(0);
  });

  it('clamps an absurd range instead of trying to serve it', async () => {
    const t = await token();
    const { body } = await request(app)
      .get('/api/v1/progress/history?days=99999')
      .set('authorization', `Bearer ${t}`)
      .expect(200);
    expect(body.days).toHaveLength(90);
  });
});

describe('POST /progress/events', () => {
  it('accepts a batch of client-reported minutes', async () => {
    const t = await token();
    await request(app)
      .post('/api/v1/progress/events')
      .set('authorization', `Bearer ${t}`)
      .send({ events: [{ type: 'practice.minutes', value: 12 }] })
      .expect(202);

    const { body } = await request(app)
      .get('/api/v1/progress/summary')
      .set('authorization', `Bearer ${t}`)
      .expect(200);
    expect(body.today.minutes).toBe(12);
  });

  it('refuses an event type the client is not the authority on', async () => {
    const t = await token();
    const res = await request(app)
      .post('/api/v1/progress/events')
      .set('authorization', `Bearer ${t}`)
      .send({ events: [{ type: 'xp.awarded', value: 999999 }] })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('refuses an implausible duration', async () => {
    const t = await token();
    await request(app)
      .post('/api/v1/progress/events')
      .set('authorization', `Bearer ${t}`)
      .send({ events: [{ type: 'practice.minutes', value: 100000 }] })
      .expect(400);
  });
});
