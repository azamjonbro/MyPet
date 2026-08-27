import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-secret-that-is-definitely-long-enough-000000';
process.env.ENCRYPTION_KEY ??= 'a'.repeat(64);
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/pet-test';
process.env.DEV_AUTH_ENABLED = 'true';

// No OpenAI key in tests: the deterministic offline tutor is what we assert
// against, so the suite never makes a network call or costs anything.
delete process.env.OPENAI_API_KEY;

// Reuse the binary pnpm already downloaded at install, rather than letting each
// test file race to fetch its own copy into the home cache.
process.env.MONGOMS_DOWNLOAD_DIR ??= path.resolve(
  process.cwd(),
  '../../node_modules/.cache/mongodb-memory-server',
);
