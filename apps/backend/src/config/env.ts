import { z } from 'zod';

// Node 22 can read a .env without a dependency. Absent file is fine: in
// production the environment comes from the platform, not a file.
//
// Never under test. The suite sets exactly the environment it wants — most
// importantly, no OPENAI_API_KEY — and loading the developer's .env over the
// top of that would silently point the tests at the live API, making them
// cost money, vary run to run, and fail on a machine with a different .env.
if (process.env.NODE_ENV !== 'test') {
  try {
    process.loadEnvFile?.();
  } catch {
    /* no .env — rely on the real environment */
  }
}

/**
 * The environment is validated once, at boot. A missing or malformed secret
 * is a startup crash with a readable message — never a 500 three weeks later.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars — try: openssl rand -hex 32'),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, 'ENCRYPTION_KEY must be 64 hex chars — try: openssl rand -hex 32')
    .optional(),

  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  DEV_AUTH_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL_TUTOR: z.string().default('gpt-4.1'),
  OPENAI_MODEL_CHEAP: z.string().default('gpt-4.1-mini'),
  DAILY_TOKEN_BUDGET: z.coerce.number().int().positive().default(60_000),

  NOTION_CLIENT_ID: z.string().optional(),
  NOTION_CLIENT_SECRET: z.string().optional(),
  NOTION_REDIRECT_URI: z.string().url().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  CORS_ORIGINS: z.string().default(''),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  · ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  console.error(`\nInvalid environment. Copy .env.example to .env and fill it in.\n\n${issues}\n`);
  process.exit(1);
}

export const env = parsed.data;

export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/** Dev auth is a development affordance and must never be reachable in production. */
export const devAuthEnabled = env.DEV_AUTH_ENABLED && !isProd;

export const googleConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

/** Notion is optional: with no credentials the extension shows it as unavailable
 *  rather than offering a button that cannot work. */
/** Email is optional too: with no SMTP the accountability email is skipped,
 *  and the setting reports itself as unavailable rather than failing nightly. */
export const emailConfigured = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);

export const notionConfigured = Boolean(
  env.NOTION_CLIENT_ID && env.NOTION_CLIENT_SECRET && env.NOTION_REDIRECT_URI,
);
