import nodemailer, { type Transporter } from 'nodemailer';
import { env, emailConfigured, isTest } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Outbound email.
 *
 * One transport, created lazily and reused: SMTP connections are expensive to
 * open and this sends a handful of messages a day. Everything here fails soft —
 * a bounced accountability email must never take the API down with it.
 */
let transport: Transporter | null = null;
let sender: ((message: Mail) => Promise<boolean>) | null = null;

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

function getTransport(): Transporter | null {
  if (!emailConfigured) return null;
  transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // 465 is implicit TLS; everything else starts plain and upgrades.
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return transport;
}

export async function sendMail(message: Mail): Promise<boolean> {
  if (sender) return sender(message);
  if (isTest) return false;

  const client = getTransport();
  if (!client) {
    logger.debug({ to: message.to }, 'email not configured — skipping');
    return false;
  }

  try {
    await client.sendMail({
      from: env.SMTP_FROM ?? `Mocha <${env.SMTP_USER}>`,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
    return true;
  } catch (err) {
    logger.warn({ err, to: message.to }, 'email failed to send');
    return false;
  }
}

/**
 * Whether anything can actually be sent right now — real SMTP, or an injected
 * sender under test. The sweep asks this before doing any work, so a server
 * with no mail configured does not query the database every twenty minutes.
 */
export function canSendMail(): boolean {
  return sender !== null || emailConfigured;
}

/** Test seam, matching the AI provider's and Notion's. */
export function setMailSender(next: ((message: Mail) => Promise<boolean>) | null): void {
  sender = next;
}

export { emailConfigured };
