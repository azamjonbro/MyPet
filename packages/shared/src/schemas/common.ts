import { z } from 'zod';

/** A calendar date in the *user's* timezone, not UTC. See §D of the audit. */
export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Expected an object id');

export const timezoneSchema = z.string().min(1).max(64).refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Expected an IANA timezone, e.g. Asia/Tashkent' },
);

/** Uniform error envelope. The extension branches on `code`, never on `message`. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_REUSED: 'TOKEN_REUSED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  AI_BUDGET_EXCEEDED: 'AI_BUDGET_EXCEEDED',
  NOTION_NOT_CONNECTED: 'NOTION_NOT_CONNECTED',
  NOTION_SCHEMA_UNMAPPED: 'NOTION_SCHEMA_UNMAPPED',
  UPSTREAM_UNAVAILABLE: 'UPSTREAM_UNAVAILABLE',
  INTERNAL: 'INTERNAL',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
