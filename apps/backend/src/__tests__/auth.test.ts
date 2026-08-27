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

const signIn = () =>
  request(app).post('/api/v1/auth/dev').send({ email: 'learner@example.com', timezone: 'Asia/Tashkent' });

describe('POST /auth/dev', () => {
  it('creates a user and returns a token pair', async () => {
    const res = await signIn().expect(200);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.refreshToken).toBeTypeOf('string');
    expect(res.body.expiresIn).toBeGreaterThan(0);
  });

  it('rejects a malformed email with a machine-readable code', async () => {
    const res = await request(app).post('/api/v1/auth/dev').send({ email: 'nope' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details[0].field).toBe('email');
  });

  it('is idempotent — signing in twice does not duplicate the account', async () => {
    await signIn().expect(200);
    await signIn().expect(200);
    const users = await mongoose.connection.collection('users').countDocuments();
    expect(users).toBe(1);
  });
});

describe('GET /me', () => {
  it('refuses without a token', async () => {
    const res = await request(app).get('/api/v1/me').expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns a fully-formed profile for a brand new learner', async () => {
    const { body } = await signIn();
    const res = await request(app)
      .get('/api/v1/me')
      .set('authorization', `Bearer ${body.accessToken}`)
      .expect(200);

    expect(res.body.user.email).toBe('learner@example.com');
    expect(res.body.user.timezone).toBe('Asia/Tashkent');
    expect(res.body.profile.level).toBe('A1');
    expect(res.body.profile.xp).toBe(0);
    expect(res.body.profile.petLevel).toBe(1);
    expect(res.body.profile.currentDay).toBe(0); // onboarding has not run yet
    expect(res.body.profile.skills.grammar).toBe(0);
  });
});

describe('PATCH /me/profile', () => {
  it('starts the 90-day clock when onboarding sets a level', async () => {
    const { body } = await signIn();
    const res = await request(app)
      .patch('/api/v1/me/profile')
      .set('authorization', `Bearer ${body.accessToken}`)
      .send({ level: 'A2', targetExam: 'IELTS', dailyGoalMinutes: 45 })
      .expect(200);

    expect(res.body.profile.level).toBe('A2');
    expect(res.body.profile.planStartDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.body.profile.currentDay).toBe(1);
  });

  it('rejects an out-of-range daily goal', async () => {
    const { body } = await signIn();
    await request(app)
      .patch('/api/v1/me/profile')
      .set('authorization', `Bearer ${body.accessToken}`)
      .send({ dailyGoalMinutes: 9999 })
      .expect(400);
  });
});

describe('refresh token rotation', () => {
  it('rotates and returns a different refresh token', async () => {
    const { body } = await signIn();
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: body.refreshToken })
      .expect(200);
    expect(res.body.refreshToken).not.toBe(body.refreshToken);
  });

  it('revokes the whole family when an old token is replayed', async () => {
    const { body } = await signIn();
    const rotated = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: body.refreshToken })
      .expect(200);

    // Replay the original — this is what a stolen token looks like.
    await request(app).post('/api/v1/auth/refresh').send({ refreshToken: body.refreshToken }).expect(401);

    // The legitimately rotated token must now be dead too.
    await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotated.body.refreshToken })
      .expect(401);
  });
});
