import { Types } from 'mongoose';
import { DailyStat, EmailLog, StudySession, User } from '../models/index.js';
import { rollupDay } from './analytics.service.js';
import { canSendMail, sendMail } from './email.service.js';
import { calendarDate, localDate } from '../utils/date.js';
import { logger } from '../config/logger.js';

/**
 * The end-of-day accountability email.
 *
 * Rules this file exists to hold, in one piece:
 *   · only after the learner's own cut-off hour, in their own timezone
 *   · only if they actually studied less than they asked to be held to
 *   · only if they were here at all today — a day the app never saw is a
 *     holiday, not a failure, and emailing about it is just noise
 *   · exactly once per learner per day, enforced by a unique index
 *
 * The tone is deliberately soft. The email exists to restart tomorrow, not to
 * make anybody feel watched.
 */
export interface MissedDay {
  userId: string;
  email: string;
  displayName: string;
  localDate: string;
  minutes: number;
  goalMinutes: number;
}

export function accountabilityEmail(day: MissedDay): { subject: string; text: string } {
  const did = day.minutes > 0 ? `You did ${day.minutes} minutes.` : 'Today had no study in it.';
  return {
    subject: 'Mocha is looking at you 😾',
    text: [
      `${day.displayName},`,
      '',
      did,
      `Your goal is ${day.goalMinutes} minutes a day.`,
      '',
      'Tomorrow we restart. Twenty minutes counts. Ten counts.',
      'Open a tab, say something to me in English, and the streak starts again.',
      '',
      '— Mocha 🐈',
      '',
      'You can turn these emails off in the extension: Settings → Accountability.',
    ].join('\n'),
  };
}

/**
 * Finds the learners whose day is over, who fell short, and who have not been
 * emailed about it yet — then sends, and records that it sent.
 */
export async function runAccountabilitySweep(now: Date = new Date()): Promise<number> {
  if (!canSendMail()) return 0;

  // Only users who asked for this. Everything else is filtered per learner
  // below, because the cut-off hour is theirs, not the server's.
  const users = await User.find({
    'settings.accountability.enabled': true,
    'settings.accountability.emailEnabled': true,
    'settings.accountability.email': { $ne: '' },
  })
    .select('displayName timezone settings')
    .limit(500);

  let sent = 0;

  for (const user of users) {
    try {
      const settings = user.settings.accountability;
      const clockHour = Number(
        new Intl.DateTimeFormat('en-GB', {
          timeZone: user.timezone,
          hour12: false,
          hour: '2-digit',
        }).format(now),
      );
      if (Number.isNaN(clockHour) || clockHour < settings.cutoffHour) continue;

      // The study day, not the calendar day: minutes are accounted that way.
      const day = localDate(user.timezone, now);
      const calendar = calendarDate(user.timezone, now);

      // Today has not been through the nightly rollup yet, so fold it in
      // first — otherwise every learner looks like they did nothing.
      await rollupDay(user._id, day);

      const [stat, sessions] = await Promise.all([
        DailyStat.findOne({ userId: user._id, localDate: day }).lean(),
        StudySession.aggregate<{ total: number }>([
          { $match: { userId: user._id, localDate: day } },
          { $group: { _id: null, total: { $sum: '$minutes' } } },
        ]),
      ]);

      const minutes = Math.max(stat?.minutes ?? 0, sessions[0]?.total ?? 0);
      if (minutes >= settings.minMinutes) continue;

      // A day with no sign of the learner at all is not a missed day.
      const sawThem = (stat?.messages ?? 0) > 0 || minutes > 0;
      if (!sawThem) continue;

      // The unique index is the real guard; this is just the cheap check.
      const already = await EmailLog.findOne({
        userId: user._id,
        kind: 'accountability',
        localDate: calendar,
      }).lean();
      if (already) continue;

      const mail = accountabilityEmail({
        userId: user._id.toString(),
        email: settings.email,
        displayName: user.displayName,
        localDate: day,
        minutes,
        goalMinutes: settings.minMinutes,
      });

      const ok = await sendMail({ to: settings.email, subject: mail.subject, text: mail.text });
      if (!ok) continue;

      await EmailLog.create({
        userId: user._id,
        kind: 'accountability',
        localDate: calendar,
        to: settings.email,
      }).catch(() => {
        /* a duplicate here means another instance won the race — fine */
      });
      sent++;
    } catch (err) {
      // One learner's failure must not stop the sweep for everybody else.
      logger.warn({ err, userId: user._id.toString() }, 'accountability check failed');
    }
  }

  return sent;
}
