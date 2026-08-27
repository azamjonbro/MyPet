import type { DevAuthRequest, GoogleAuthRequest } from '@pet/shared';
import { env, googleConfigured } from '../config/env.js';
import { Profile, User, type UserDoc } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { isValidTimezone } from '../utils/date.js';
import { issueTokens, type IssuedTokens } from './token.service.js';

interface GoogleIdentity {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

/**
 * Exchanges the code from chrome.identity.launchWebAuthFlow.
 *
 * The client secret lives here and only here — the extension sends a code, not
 * a token, and never touches Google's API directly.
 */
async function exchangeGoogleCode(req: GoogleAuthRequest): Promise<GoogleIdentity> {
  if (!googleConfigured) {
    throw new AppError(503, 'UPSTREAM_UNAVAILABLE', 'Google sign-in is not configured on the server.');
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: req.code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: req.redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    throw AppError.unauthenticated('Google did not accept that sign-in. Please try again.');
  }
  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) throw AppError.unauthenticated('Google sign-in failed. Please try again.');

  const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  if (!infoRes.ok) throw AppError.unauthenticated('Could not read your Google profile.');

  const info = (await infoRes.json()) as { sub?: string; email?: string; name?: string; picture?: string };
  if (!info.sub || !info.email) throw AppError.unauthenticated('Google did not return an email address.');

  return { sub: info.sub, email: info.email, name: info.name, picture: info.picture };
}

async function upsertUser(identity: GoogleIdentity, timezone?: string): Promise<UserDoc> {
  const tz = timezone && isValidTimezone(timezone) ? timezone : 'UTC';
  const email = identity.email.toLowerCase();

  let user = await User.findOne({ $or: [{ googleId: identity.sub }, { email }] });

  if (!user) {
    user = await User.create({
      email,
      googleId: identity.sub,
      displayName: identity.name || email.split('@')[0] || 'Learner',
      avatarUrl: identity.picture,
      timezone: tz,
    });
    await Profile.create({ userId: user._id });
    return user;
  }

  let dirty = false;
  if (!user.googleId && identity.sub) { user.googleId = identity.sub; dirty = true; }
  if (timezone && isValidTimezone(timezone) && user.timezone !== timezone) { user.timezone = timezone; dirty = true; }
  if (dirty) await user.save();

  await Profile.updateOne({ userId: user._id }, { $setOnInsert: { userId: user._id } }, { upsert: true });
  return user;
}

export async function signInWithGoogle(
  req: GoogleAuthRequest,
  userAgent?: string,
): Promise<IssuedTokens> {
  const identity = await exchangeGoogleCode(req);
  const user = await upsertUser(identity, req.timezone);
  return issueTokens(user._id, user.email, { userAgent });
}

/**
 * Development-only sign-in so the project is runnable before a Google Cloud
 * project exists. Guarded by `devAuthEnabled`, which is false in production.
 */
export async function signInDev(req: DevAuthRequest, userAgent?: string): Promise<IssuedTokens> {
  const email = req.email.toLowerCase();
  const user = await upsertUser(
    { sub: `dev:${email}`, email, name: req.displayName ?? email.split('@')[0] },
    req.timezone,
  );
  return issueTokens(user._id, user.email, { userAgent });
}
