import { Types } from 'mongoose';
import { SKILLS, TOPIC_LABEL, levelFromXp, type GrammarTopic, type Skill } from '@pet/shared';
import { DailyStat, Mistake, Profile, User } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { addDays, localDate, planDayFor } from '../utils/date.js';
import { streakAtRisk } from './streak.service.js';
import { rollupDay } from './analytics.service.js';

export async function summary(userId: string) {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('That account no longer exists.');
  const profile = await Profile.findOne({ userId: user._id });
  if (!profile) throw AppError.notFound('No profile yet.');

  const today = localDate(user.timezone);
  // Today is not rolled up yet by the nightly job, so compute it on read —
  // a dashboard that lags a day behind the practice you just did feels broken.
  const todayTotals = await rollupDay(user._id, today);
  const level = levelFromXp(profile.xp);

  return {
    xp: profile.xp,
    level: level.level,
    title: level.title,
    xpIntoLevel: level.xpIntoLevel,
    xpForNextLevel: level.xpForNextLevel,
    progress: level.progress,
    currentDay: planDayFor(profile.planStartDate ?? null, today),
    streak: {
      current: profile.streak.current,
      longest: profile.streak.longest,
      atRisk: streakAtRisk(profile, today),
    },
    skills: Object.fromEntries(
      SKILLS.map((s) => [s, Math.round(profile.skills[s] ?? 0)]),
    ) as Record<Skill, number>,
    today: todayTotals,
  };
}

export interface WeaknessView {
  topicId: GrammarTopic;
  label: string;
  count: number;
  lastSeen: string;
  examples: { original: string; corrected: string }[];
}

/**
 * Ranked weak topics with the evidence behind each one.
 *
 * The learner should be able to see *why* a topic is on the list — a bare
 * "you are bad at articles" is not actionable, three of their own sentences are.
 */
export async function weaknesses(userId: string, limit = 5): Promise<WeaknessView[]> {
  const rows = await Mistake.aggregate<{
    _id: GrammarTopic;
    count: number;
    lastSeen: Date;
    examples: { original: string; corrected: string }[];
  }>([
    { $match: { userId: new Types.ObjectId(userId), resolved: false } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: '$topicId',
        count: { $sum: 1 },
        lastSeen: { $max: '$createdAt' },
        examples: { $push: { original: '$original', corrected: '$corrected' } },
      },
    },
    { $sort: { count: -1, lastSeen: -1 } },
    { $limit: limit },
  ]);

  return rows.map((r) => ({
    topicId: r._id,
    label: TOPIC_LABEL[r._id] ?? r._id,
    count: r.count,
    lastSeen: r.lastSeen.toISOString(),
    examples: r.examples.slice(0, 3),
  }));
}

/** Daily stats for a window, with missing days filled in as zeroes. */
export async function history(userId: string, days = 30) {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('That account no longer exists.');

  const today = localDate(user.timezone);
  const from = addDays(today, -(days - 1));

  // Today has not been through the nightly job yet, so fold it in first —
  // otherwise the chart shows an empty bar for the practice just done.
  await rollupDay(user._id, today);

  const rows = await DailyStat.find({
    userId: user._id,
    localDate: { $gte: from, $lte: today },
  })
    .sort({ localDate: 1 })
    .lean();

  const byDate = new Map(rows.map((r) => [r.localDate, r]));

  // A chart with holes in it reads as missing data, not as a day off.
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    const row = byDate.get(date);
    return {
      localDate: date,
      minutes: row?.minutes ?? 0,
      messages: row?.messages ?? 0,
      corrections: row?.corrections ?? 0,
      wordsLearned: row?.wordsLearned ?? 0,
      xp: row?.xp ?? 0,
    };
  });
}
