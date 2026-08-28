import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
afterEach(async () => {
  const { setMailSender } = await import('../services/email.service.js');
  setMailSender(null);
});

async function token(email = 'learner@example.com'): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/dev')
    .send({ email, timezone: 'Asia/Tashkent' });
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

interface Frame { type: string; result?: { type: string; ok: boolean; message: string } }

async function say(t: string, text: string): Promise<Frame[]> {
  const res = await collect(
    request(app).post('/api/v1/chat/message').set('authorization', `Bearer ${t}`).send({ text }),
  ).expect(200);
  return String(res.body ?? res.text)
    .split('\n\n')
    .filter((frame) => frame.startsWith('data:'))
    .map((frame) => JSON.parse(frame.slice(5).trim()) as Frame);
}

describe('telling Mocha to do something, in passing', () => {
  it('writes a task into today from a plain sentence', async () => {
    const t = await token();
    await request(app).get('/api/v1/missions/today').set('authorization', `Bearer ${t}`).expect(200);

    const frames = await say(t, 'Add task: check the SwissWatch SEO');
    const action = frames.find((f) => f.type === 'action');
    expect(action?.result?.type).toBe('CREATE_TASK');
    expect(action?.result?.ok).toBe(true);

    const { body } = await request(app)
      .get('/api/v1/missions/today')
      .set('authorization', `Bearer ${t}`)
      .expect(200);
    const own = body.mission.tasks.find((task: { kind: string }) => task.kind === 'own');
    expect(own.title).toBe('check the SwissWatch SEO');
    expect(own.done).toBe(false);
  });

  it('sets a reminder at the time the learner actually meant', async () => {
    const t = await token();
    const frames = await say(t, 'Remind me to call the bank at 7pm');
    expect(frames.find((f) => f.type === 'action')?.result?.ok).toBe(true);

    const { body } = await request(app)
      .get('/api/v1/study/reminders')
      .set('authorization', `Bearer ${t}`)
      .expect(200);

    expect(body.reminders).toHaveLength(1);
    expect(body.reminders[0].title).toBe('call the bank');
    expect(body.reminders[0].dueAtLocal).toMatch(/T19:00$/);
    expect(body.reminders[0].delivered).toBe(false);
  });

  it('adds words to the learner\'s own list', async () => {
    const t = await token();
    const frames = await say(t, 'add words: commute, errand and reliable');
    expect(frames.find((f) => f.type === 'action')?.result?.ok).toBe(true);

    const { body } = await request(app)
      .get('/api/v1/vocab')
      .set('authorization', `Bearer ${t}`)
      .expect(200);
    // Mocha teaches a word of her own each turn; these are the learner's.
    const mine = body.words
      .filter((w: { source: string }) => w.source === 'learner')
      .map((w: { word: string }) => w.word)
      .sort();
    expect(mine).toEqual(['commute', 'errand', 'reliable']);
  });

  it('does nothing at all when the learner was only chatting', async () => {
    const t = await token();
    const frames = await say(t, 'I woke up at 7 and then I went to work.');
    expect(frames.find((f) => f.type === 'action')).toBeUndefined();

    const { body } = await request(app)
      .get('/api/v1/study/reminders')
      .set('authorization', `Bearer ${t}`)
      .expect(200);
    expect(body.reminders).toEqual([]);
  });
});

describe('using your own words', () => {
  it('counts a word the learner actually used, in any form', async () => {
    const t = await token();
    await request(app)
      .post('/api/v1/vocab')
      .set('authorization', `Bearer ${t}`)
      .send({ words: [{ word: 'commute', note: 'yo\'l' }, { word: 'to postpone' }] })
      .expect(201);

    await say(t, 'We postponed the meeting because my commute was long.');

    const { body } = await request(app)
      .get('/api/v1/vocab')
      .set('authorization', `Bearer ${t}`)
      .expect(200);
    const used = Object.fromEntries(
      body.words.map((w: { word: string; timesUsed: number }) => [w.word, w.timesUsed]),
    );
    expect(used.commute).toBe(1);
    expect(used['to postpone']).toBe(1);
  });

  it('puts a "use your words" task into the day once there are words', async () => {
    const t = await token();
    await request(app)
      .post('/api/v1/vocab')
      .set('authorization', `Bearer ${t}`)
      .send({ words: [{ word: 'commute' }, { word: 'errand' }, { word: 'reliable' }] })
      .expect(201);

    const { body } = await request(app)
      .get('/api/v1/missions/today')
      .set('authorization', `Bearer ${t}`)
      .expect(200);

    const task = body.mission.tasks.find((x: { kind: string }) => x.kind === 'usewords');
    expect(task).toBeDefined();
    expect(task.words.length).toBeGreaterThanOrEqual(2);
    expect(task.target).toBe(task.words.length);

    await say(t, 'My commute today was long and I had one errand after work.');

    const after = await request(app)
      .get('/api/v1/missions/today')
      .set('authorization', `Bearer ${t}`)
      .expect(200);
    const updated = after.body.mission.tasks.find((x: { kind: string }) => x.kind === 'usewords');
    expect(updated.progress).toBe(2);
  });

  it('does not count the same word twice in one day', async () => {
    const t = await token();
    await request(app)
      .post('/api/v1/vocab')
      .set('authorization', `Bearer ${t}`)
      .send({ words: [{ word: 'commute' }, { word: 'errand' }] })
      .expect(201);
    await request(app).get('/api/v1/missions/today').set('authorization', `Bearer ${t}`).expect(200);

    await say(t, 'My commute was long.');
    await say(t, 'My commute was long again.');

    const { body } = await request(app)
      .get('/api/v1/missions/today')
      .set('authorization', `Bearer ${t}`)
      .expect(200);
    const task = body.mission.tasks.find((x: { kind: string }) => x.kind === 'usewords');
    expect(task.progress).toBe(1);
  });
});

describe('a study session', () => {
  it('is one session however many times you press start', async () => {
    const t = await token();
    const first = await request(app)
      .post('/api/v1/study/session')
      .set('authorization', `Bearer ${t}`)
      .send({ subject: 'English', plannedMinutes: 30 })
      .expect(201);
    const second = await request(app)
      .post('/api/v1/study/session')
      .set('authorization', `Bearer ${t}`)
      .send({ subject: 'English', plannedMinutes: 45 })
      .expect(201);

    expect(second.body.session.id).toBe(first.body.session.id);
  });

  it('logs the minutes when it ends, and refuses to end nothing', async () => {
    const t = await token();
    await request(app)
      .post('/api/v1/study/session')
      .set('authorization', `Bearer ${t}`)
      .send({ subject: 'English', plannedMinutes: 30 })
      .expect(201);

    const { body } = await request(app)
      .post('/api/v1/study/session/end')
      .set('authorization', `Bearer ${t}`)
      .expect(200);
    expect(body.session.endedAt).not.toBeNull();
    expect(body.session.minutes).toBe(0); // it took milliseconds, not minutes

    await request(app)
      .post('/api/v1/study/session/end')
      .set('authorization', `Bearer ${t}`)
      .expect(404);
  });
});

describe('the accountability email', () => {
  async function setUp(overrides: Record<string, unknown> = {}) {
    const t = await token();
    await request(app)
      .patch('/api/v1/me/settings')
      .set('authorization', `Bearer ${t}`)
      .send({
        accountability: {
          enabled: true,
          emailEnabled: true,
          email: 'learner@example.com',
          cutoffHour: 12,
          minMinutes: 15,
          ...overrides,
        },
      })
      .expect(200);
    return t;
  }

  /**
   * Afternoon on the same study day the events landed in.
   *
   * Derived rather than hard-coded: the study day starts at 04:00 local, so a
   * suite run at half past midnight writes its events into *yesterday* — and a
   * fixed date would then look at a day with nothing in it.
   */
  async function afternoonOfToday(): Promise<Date> {
    const { localDate } = await import('../utils/date.js');
    return new Date(`${localDate('Asia/Tashkent')}T09:00:00Z`); // 14:00 in Tashkent
  }

  it('emails a learner who showed up and then did nothing', async () => {
    const t = await setUp();
    await say(t, 'Hello Mocha.'); // seen today, but no study minutes

    const sent: { to: string; subject: string; text: string }[] = [];
    const { setMailSender } = await import('../services/email.service.js');
    setMailSender(async (mail) => {
      sent.push(mail);
      return true;
    });

    const { runAccountabilitySweep } = await import('../services/accountability.service.js');
    expect(await runAccountabilitySweep(await afternoonOfToday())).toBe(1);
    expect(sent[0]?.to).toBe('learner@example.com');
    expect(sent[0]?.subject).toContain('Mocha');
    expect(sent[0]?.text).toContain('Tomorrow we restart');

    // …and never twice for the same day.
    expect(await runAccountabilitySweep(await afternoonOfToday())).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it('says nothing to a learner who met the goal', async () => {
    const t = await setUp();
    await request(app)
      .post('/api/v1/progress/events')
      .set('authorization', `Bearer ${t}`)
      .send({ events: [{ type: 'practice.minutes', value: 20 }] })
      .expect(202);

    const sent: unknown[] = [];
    const { setMailSender } = await import('../services/email.service.js');
    setMailSender(async () => {
      sent.push(1);
      return true;
    });

    const { runAccountabilitySweep } = await import('../services/accountability.service.js');
    expect(await runAccountabilitySweep(await afternoonOfToday())).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('treats a day the learner never appeared as a day off, not a failure', async () => {
    await setUp(); // no chat, no minutes: we never saw them

    const sent: unknown[] = [];
    const { setMailSender } = await import('../services/email.service.js');
    setMailSender(async () => {
      sent.push(1);
      return true;
    });

    const { runAccountabilitySweep } = await import('../services/accountability.service.js');
    expect(await runAccountabilitySweep(await afternoonOfToday())).toBe(0);
  });

  it('says nothing before the learner\'s own cut-off hour', async () => {
    const t = await setUp({ cutoffHour: 23 });
    await say(t, 'Hello.');

    const sent: unknown[] = [];
    const { setMailSender } = await import('../services/email.service.js');
    setMailSender(async () => {
      sent.push(1);
      return true;
    });

    const { runAccountabilitySweep } = await import('../services/accountability.service.js');
    expect(await runAccountabilitySweep(await afternoonOfToday())).toBe(0);
  });
});
