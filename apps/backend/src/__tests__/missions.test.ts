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

const today = (t: string) =>
  request(app).get('/api/v1/missions/today').set('authorization', `Bearer ${t}`).expect(200);

interface Task { id: string; kind: string; skill: string; target: number; progress: number; done: boolean; xp: number }

describe('GET /missions/today', () => {
  it('needs a token', async () => {
    await request(app).get('/api/v1/missions/today').expect(401);
  });

  it('generates a day of work the first time it is asked', async () => {
    const t = await token();
    const { body } = await today(t);

    expect(body.mission.tasks.length).toBeGreaterThanOrEqual(3);
    expect(body.mission.status).toBe('active');
    expect(body.mission.source).toBe('template'); // no OPENAI_API_KEY in tests
    expect(body.mission.tasks.some((task: Task) => task.kind === 'chat')).toBe(true);
    expect(body.completionBonus).toBeGreaterThan(0);
  });

  it('returns the same mission on a second read rather than planning again', async () => {
    const t = await token();
    const first = await today(t);
    const second = await today(t);

    expect(second.body.mission.title).toBe(first.body.mission.title);
    expect(await mongoose.connection.collection('missions').countDocuments({})).toBe(1);
  });

  it('never lets the planner mint its own XP or targets', async () => {
    const t = await token();
    const { body } = await today(t);

    for (const task of body.mission.tasks as Task[]) {
      expect(task.xp).toBeGreaterThan(0);
      expect(task.xp).toBeLessThanOrEqual(50);
      expect(task.target).toBeGreaterThanOrEqual(1);
      expect(task.progress).toBe(0);
      expect(task.done).toBe(false);
    }
  });
});

describe('mission progress', () => {
  it('advances the chat task from real turns, not from asking', async () => {
    const t = await token();
    await today(t);
    await say(t, 'Hello Mochi.');
    await say(t, 'I like reading books.');

    const { body } = await today(t);
    const chat = (body.mission.tasks as Task[]).find((task) => task.kind === 'chat')!;
    expect(chat.progress).toBe(2);
  });

  it('ignores turns taken before the day had a mission', async () => {
    const t = await token();
    await say(t, 'Hello.');

    const { body } = await today(t);
    const chat = (body.mission.tasks as Task[]).find((task) => task.kind === 'chat')!;
    expect(chat.progress).toBe(0);
  });

  it('refuses to tick off a task the server verifies', async () => {
    const t = await token();
    const { body } = await today(t);
    const chat = (body.mission.tasks as Task[]).find((task) => task.kind === 'chat')!;

    const res = await request(app)
      .post(`/api/v1/missions/today/tasks/${chat.id}/complete`)
      .set('authorization', `Bearer ${t}`)
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('pays XP for a task only the learner can see, once', async () => {
    const t = await token();
    const { body } = await today(t);
    const manual = (body.mission.tasks as Task[]).find(
      (task) => !['chat', 'vocab', 'fix'].includes(task.kind),
    )!;

    const first = await request(app)
      .post(`/api/v1/missions/today/tasks/${manual.id}/complete`)
      .set('authorization', `Bearer ${t}`)
      .expect(200);
    expect(first.body.xpAwarded).toBe(manual.xp);

    const second = await request(app)
      .post(`/api/v1/missions/today/tasks/${manual.id}/complete`)
      .set('authorization', `Bearer ${t}`)
      .expect(200);
    expect(second.body.xpAwarded).toBe(0);
  });

  it('credits the skill a finished task actually exercised', async () => {
    const t = await token();
    const { body } = await today(t);
    const manual = (body.mission.tasks as Task[]).find(
      (task) => !['chat', 'vocab', 'fix'].includes(task.kind),
    )!;

    const before = await request(app)
      .get('/api/v1/progress/summary')
      .set('authorization', `Bearer ${t}`)
      .expect(200);
    expect(before.body.skills[manual.skill]).toBe(0);

    await request(app)
      .post(`/api/v1/missions/today/tasks/${manual.id}/complete`)
      .set('authorization', `Bearer ${t}`)
      .expect(200);

    const after = await request(app)
      .get('/api/v1/progress/summary')
      .set('authorization', `Bearer ${t}`)
      .expect(200);
    expect(after.body.skills[manual.skill]).toBeGreaterThan(0);
  });

  it('advances a read task from client-reported minutes', async () => {
    const t = await token();
    const { body } = await today(t);
    const read = (body.mission.tasks as Task[]).find((task) => task.kind === 'read');
    if (!read) return; // this learner's template gave them a `fix` task instead

    await request(app)
      .post('/api/v1/progress/events')
      .set('authorization', `Bearer ${t}`)
      .send({ events: [{ type: 'practice.minutes', value: read.target }] })
      .expect(202);

    const after = await today(t);
    expect((after.body.mission.tasks as Task[]).find((task) => task.kind === 'read')!.done).toBe(true);
  });

  it('pays the completion bonus once the whole day is done, and only then', async () => {
    const t = await token();
    const { body } = await today(t);
    const bonus = body.completionBonus as number;
    const tasks = body.mission.tasks as Task[];

    // Finish everything the learner reports themselves.
    for (const task of tasks.filter((task) => !['chat', 'vocab', 'fix'].includes(task.kind))) {
      await request(app)
        .post(`/api/v1/missions/today/tasks/${task.id}/complete`)
        .set('authorization', `Bearer ${t}`)
        .expect(200);
    }
    // …and everything the server verifies.
    const chat = tasks.find((task) => task.kind === 'chat')!;
    let last: { xpAwarded: number; missionCompleted: boolean } | null = null;
    for (let i = 0; i < chat.target + 6; i++) {
      const res = await say(t, `Today I read a book about ${i} birds.`);
      // The custom SSE parser above hands the raw stream back as the body.
      const frames = String(res.body ?? res.text)
        .split('\n\n')
        .filter((f) => f.startsWith('data:'))
        .map((f) => JSON.parse(f.slice(5).trim()) as { type: string; missionCompleted?: boolean; xpAwarded?: number });
      const mission = frames.find((f) => f.type === 'mission');
      if (mission?.missionCompleted) {
        last = { xpAwarded: mission.xpAwarded ?? 0, missionCompleted: true };
        break;
      }
    }

    expect(last?.missionCompleted).toBe(true);
    expect(last!.xpAwarded).toBeGreaterThanOrEqual(bonus);

    const after = await today(t);
    expect(after.body.mission.status).toBe('complete');
    expect(after.body.mission.completedAt).not.toBeNull();
  });
});

describe('GET /missions/history', () => {
  it('is empty before anything is planned', async () => {
    const t = await token();
    const { body } = await request(app)
      .get('/api/v1/missions/history')
      .set('authorization', `Bearer ${t}`)
      .expect(200);
    expect(body.missions).toEqual([]);
  });

  it('reports how much of each day was finished', async () => {
    const t = await token();
    await today(t);

    const { body } = await request(app)
      .get('/api/v1/missions/history')
      .set('authorization', `Bearer ${t}`)
      .expect(200);

    expect(body.missions).toHaveLength(1);
    expect(body.missions[0].tasksDone).toBe(0);
    expect(body.missions[0].tasksTotal).toBeGreaterThanOrEqual(3);
  });
});

describe('POST /me/onboarding', () => {
  it('starts the 90-day plan and is what marks the learner onboarded', async () => {
    const t = await token();
    const before = await request(app).get('/api/v1/me').set('authorization', `Bearer ${t}`).expect(200);
    expect(before.body.profile.onboarded).toBe(false);
    expect(before.body.profile.planStartDate).toBeNull();

    const { body } = await request(app)
      .post('/api/v1/me/onboarding')
      .set('authorization', `Bearer ${t}`)
      .send({
        level: 'A2',
        targetLevel: 'B2',
        targetExam: 'IELTS',
        dailyGoalMinutes: 20,
        timezone: 'Asia/Tashkent',
        reminderHour: 20,
      })
      .expect(200);

    expect(body.profile.onboarded).toBe(true);
    expect(body.profile.level).toBe('A2');
    expect(body.profile.currentDay).toBe(1);
    expect(body.user.settings.notifications.reminderHour).toBe(20);
  });

  it('refuses a level it does not know', async () => {
    const t = await token();
    const res = await request(app)
      .post('/api/v1/me/onboarding')
      .set('authorization', `Bearer ${t}`)
      .send({ level: 'Z9', targetLevel: 'B2', dailyGoalMinutes: 20, timezone: 'Asia/Tashkent' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});

describe('PATCH /me/settings', () => {
  it('updates only what was sent, and normalises muted sites', async () => {
    const t = await token();
    const { body } = await request(app)
      .patch('/api/v1/me/settings')
      .set('authorization', `Bearer ${t}`)
      .send({
        blockedHosts: ['  MAIL.google.com ', 'mail.google.com', ''],
        notifications: { quietMode: true },
      })
      .expect(200);

    expect(body.user.settings.blockedHosts).toEqual(['mail.google.com']);
    expect(body.user.settings.notifications.quietMode).toBe(true);
    expect(body.user.settings.notifications.missionReminder).toBe(true); // untouched
    expect(body.user.settings.petEnabled).toBe(true);
  });
});
