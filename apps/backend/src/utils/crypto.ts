import crypto from 'node:crypto';
import { env } from '../config/env.js';

/**
 * AES-256-GCM for third-party tokens at rest (Notion, §I).
 * The key never leaves the environment; ciphertext, iv and tag are stored
 * separately so a partial leak is useless.
 */
export interface SealedValue {
  ciphertext: string;
  iv: string;
  tag: string;
}

function key(): Buffer {
  if (!env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY is not set — required before storing third-party tokens.');
  }
  return Buffer.from(env.ENCRYPTION_KEY, 'hex');
}

export function seal(plaintext: string): SealedValue {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

export function unseal(sealed: SealedValue): string {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(sealed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function randomToken(bytes = 48): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Refresh tokens are stored only as hashes, so a database dump grants nothing. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
