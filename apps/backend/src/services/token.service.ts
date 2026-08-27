import jwt from 'jsonwebtoken';
import type { Types } from 'mongoose';
import { env } from '../config/env.js';
import { RefreshToken } from '../models/index.js';
import { hashToken, randomToken } from '../utils/crypto.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../config/logger.js';

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

const ACCESS_TTL_SECONDS = parseTtl(env.ACCESS_TOKEN_TTL);

function parseTtl(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl.trim());
  if (!match) return 900;
  const value = Number(match[1]);
  const unit = match[2];
  const multiplier = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86_400;
  return value * multiplier;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: ACCESS_TTL_SECONDS });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (typeof decoded === 'string' || !decoded.sub) throw new Error('malformed');
    return { sub: String(decoded.sub), email: String((decoded as jwt.JwtPayload).email ?? '') };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw AppError.tokenExpired();
    throw AppError.unauthenticated('That session is no longer valid.');
  }
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export async function issueTokens(
  userId: Types.ObjectId,
  email: string,
  opts: { family?: string; userAgent?: string } = {},
): Promise<IssuedTokens> {
  const refreshToken = randomToken();
  const family = opts.family ?? randomToken(16);

  await RefreshToken.create({
    userId,
    tokenHash: hashToken(refreshToken),
    family,
    userAgent: opts.userAgent,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
  });

  return {
    accessToken: signAccessToken({ sub: userId.toString(), email }),
    refreshToken,
    expiresIn: ACCESS_TTL_SECONDS,
  };
}

export async function rotateRefreshToken(
  presented: string,
  userAgent?: string,
): Promise<IssuedTokens> {
  const record = await RefreshToken.findOne({ tokenHash: hashToken(presented) });

  if (!record) throw AppError.unauthenticated('Please sign in again.');

  // Reuse detection: a token that was already rotated or revoked means the
  // token leaked. Kill the whole family rather than just this one.
  if (record.rotatedAt || record.revokedAt) {
    await RefreshToken.updateMany(
      { family: record.family, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    logger.warn({ userId: record.userId, family: record.family }, 'refresh token reuse detected');
    throw AppError.unauthenticated('Please sign in again.');
  }

  if (record.expiresAt.getTime() < Date.now()) {
    throw AppError.unauthenticated('Please sign in again.');
  }

  record.rotatedAt = new Date();
  await record.save();

  const { User } = await import('../models/index.js');
  const user = await User.findById(record.userId).select('email').lean();
  if (!user) throw AppError.unauthenticated('Please sign in again.');

  return issueTokens(record.userId, user.email, { family: record.family, userAgent });
}

export async function revokeFamilyFor(presented: string): Promise<void> {
  const record = await RefreshToken.findOne({ tokenHash: hashToken(presented) });
  if (!record) return;
  await RefreshToken.updateMany(
    { family: record.family, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}
