process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-secret-that-is-definitely-long-enough-000000';
process.env.ENCRYPTION_KEY ??= 'a'.repeat(64);
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/pet-test';
process.env.DEV_AUTH_ENABLED = 'true';
