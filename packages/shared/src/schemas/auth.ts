import { z } from 'zod';
import { timezoneSchema } from './common.js';

export const googleAuthRequestSchema = z.object({
  /** Authorization code from chrome.identity.launchWebAuthFlow. */
  code: z.string().min(10),
  redirectUri: z.string().url(),
  timezone: timezoneSchema.optional(),
});
export type GoogleAuthRequest = z.infer<typeof googleAuthRequestSchema>;

/** Development-only shortcut so the app is runnable before a Google project exists. */
export const devAuthRequestSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(80).optional(),
  timezone: timezoneSchema.optional(),
});
export type DevAuthRequest = z.infer<typeof devAuthRequestSchema>;

export const refreshRequestSchema = z.object({ refreshToken: z.string().min(20) });
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().positive(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;
