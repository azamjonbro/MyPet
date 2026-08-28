import crypto from 'node:crypto';
import {
  XP_AWARD,
  levelFromXp,
  type ChatStreamEvent,
  type Correction,
  type GrammarTopic,
  type TutorReply,
} from '@pet/shared';
import { Conversation, Mistake, Profile, User, VocabItem } from '../models/index.js';
import { getProvider } from '../ai/index.js';
import { SUMMARISE_INSTRUCTION } from '../ai/prompts/system.js';
import { assertWithinBudget, recordUsage } from '../ai/budget.js';
import {
  WORKING_MEMORY_TURNS,
  assembleContext,
  shouldSummarise,
} from './memory.service.js';
import { ensureProfile } from './profile.service.js';
import { applyActivity } from './streak.service.js';
import { record } from './analytics.service.js';
import { recordChatTurn } from './mission.service.js';
import { AppError } from '../utils/errors.js';
import { localDate } from '../utils/date.js';
import { logger } from '../config/logger.js';

export interface TurnInput {
  userId: string;
  sessionId?: string;
  text: string;
  emit: (event: ChatStreamEvent) => void;
}

/**
 * One tutoring turn, start to finish.
 *
 * Order matters here: the learner's message is persisted BEFORE the model is
 * called, so a crash mid-generation loses the reply but never the learner's
 * own words.
 */
export async function runTurn(input: TurnInput): Promise<void> {
  const user = await User.findById(input.userId);
  if (!user) throw AppError.notFound('That account no longer exists.');
  const profile = await ensureProfile(user._id);

  const today = localDate(user.timezone);
  await assertWithinBudget(input.userId, today);

  const sessionId = input.sessionId ?? crypto.randomUUID();
  const conversation =
    (await Conversation.findOne({ userId: user._id, sessionId })) ??
    (await Conversation.create({ userId: user._id, sessionId, messages: [] }));

  input.emit({ type: 'open', sessionId });

  const userMessageId = crypto.randomUUID();
  conversation.messages.push({
    id: userMessageId,
    role: 'user',
    content: input.text,
    ts: Date.now(),
  });
  await conversation.save();

  const context = await assembleContext(user, profile, conversation, today);
  const provider = getProvider();

  let result: { reply: TutorReply; usage: { inputTokens: number; outputTokens: number } };
  try {
    result = await provider.tutor(
      { systemPrompt: context.systemPrompt, messages: context.messages, level: profile.level },
      (text) => input.emit({ type: 'token', text }),
    );
  } catch (err) {
    logger.error({ err, provider: provider.name }, 'tutor call failed');
    throw err instanceof AppError
      ? err
      : new AppError(502, 'UPSTREAM_UNAVAILABLE', 'Mochi cannot think right now. Try again in a moment.');
  }

  await recordUsage(input.userId, today, result.usage);

  const { reply } = result;
  const petMessageId = crypto.randomUUID();

  conversation.messages.push({
    id: petMessageId,
    role: 'pet',
    content: reply.reply,
    ts: Date.now(),
    corrections: reply.corrections.length > 0 ? reply.corrections : undefined,
  });

  if (reply.corrections.length > 0) {
    input.emit({ type: 'corrections', corrections: reply.corrections });
    await persistMistakes(user._id, userMessageId, reply.corrections, today);
  }
  let wordsLearned = 0;
  if (reply.newVocab.length > 0) {
    input.emit({ type: 'vocab', items: reply.newVocab });
    wordsLearned = await persistVocab(user._id, petMessageId, reply.newVocab, today);
  }

  // Practising is what advances the streak — one turn is enough to have
  // shown up today. The bonus is paid once per day, on the day it advances.
  const streak = applyActivity(profile, today);

  const xpAwarded = awardFor(reply) + streak.bonusXp;
  profile.xp += xpAwarded;
  bumpSkills(profile, reply.corrections);
  await Promise.all([conversation.save(), profile.save()]);

  record(user._id, 'chat.message', today);
  record(user._id, 'xp.awarded', today, xpAwarded);
  if (reply.corrections.length > 0) {
    record(user._id, 'correction.received', today, reply.corrections.length);
  }
  if (wordsLearned > 0) {
    record(user._id, 'vocab.learned', today, wordsLearned);
  }

  // Missions are settled after the profile is saved, on purpose: the mission
  // service adds its XP with an atomic $inc, and a save() here afterwards would
  // write back the pre-increment value it read.
  const mission = await recordChatTurn(input.userId, today, {
    vocabLearned: wordsLearned,
    correctedTopics: reply.corrections.map((c) => c.topicId as GrammarTopic),
  });
  if (mission.completedTasks.length > 0) {
    input.emit({
      type: 'mission',
      completedTasks: mission.completedTasks.map((t) => ({ id: t.id, title: t.title, xp: t.xp })),
      missionCompleted: mission.missionCompleted,
      xpAwarded: mission.xpAwarded,
    });
  }

  // Fold older turns into the rolling summary once the window overflows.
  if (shouldSummarise(conversation)) {
    void summariseInBackground(conversation.id as string).catch((err: unknown) =>
      logger.warn({ err }, 'summarisation failed — the conversation still works'),
    );
  }

  input.emit({
    type: 'done',
    sessionId,
    xpAwarded: xpAwarded + mission.xpAwarded,
    xpTotal: profile.xp + mission.xpAwarded,
    followUp: reply.followUp,
  });
}

function awardFor(reply: TutorReply): number {
  let xp = XP_AWARD.MESSAGE_SENT;
  // A correction the learner receives is worth something — being wrong and
  // being shown why is the point, so it is never penalised.
  xp += reply.corrections.length * XP_AWARD.CORRECTION_ACCEPTED;
  xp += reply.newVocab.length * XP_AWARD.VOCAB_LEARNED;
  return xp;
}

/** Small, bounded nudges. Real skill scoring arrives with analytics in Phase 4. */
function bumpSkills(
  profile: { skills: Record<string, number | undefined> },
  corrections: Correction[],
): void {
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  profile.skills.writing = clamp((profile.skills.writing ?? 0) + 0.5);
  profile.skills.grammar = clamp((profile.skills.grammar ?? 0) + (corrections.length === 0 ? 0.8 : 0.2));
  profile.skills.vocabulary = clamp((profile.skills.vocabulary ?? 0) + 0.3);
}

async function persistMistakes(
  userId: import('mongoose').Types.ObjectId,
  messageId: string,
  corrections: Correction[],
  today: string,
): Promise<void> {
  await Mistake.insertMany(
    corrections.map((c) => ({
      userId,
      messageId,
      original: c.original,
      corrected: c.corrected,
      topicId: c.topicId as GrammarTopic,
      explanation: c.explanation,
      severity: c.severity,
      localDate: today,
    })),
  );
}

/**
 * Stores the words the tutor taught, one row per learner per word.
 *
 * Returns how many were genuinely new: teaching "commute" for the third time
 * is not three words learned, and the dashboard would be flattering nonsense
 * if it were counted that way.
 */
async function persistVocab(
  userId: import('mongoose').Types.ObjectId,
  messageId: string,
  items: TutorReply['newVocab'],
  today: string,
): Promise<number> {
  let learned = 0;
  for (const item of items) {
    const key = item.word.trim().toLowerCase();
    if (!key) continue;
    const res = await VocabItem.updateOne(
      { userId, key },
      {
        $setOnInsert: {
          userId,
          key,
          word: item.word.trim(),
          definition: item.definition,
          example: item.example,
          localDate: today,
          messageId,
        },
      },
      { upsert: true },
    ).catch(() => null);
    if (res?.upsertedCount) learned++;
  }
  return learned;
}

/**
 * Compresses the oldest turns outside the working window into `summary`.
 * Runs after the learner already has their reply, so it never adds latency.
 */
export async function summariseInBackground(conversationId: string): Promise<void> {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) return;

  const keepFrom = Math.max(0, conversation.messages.length - WORKING_MEMORY_TURNS * 2);
  const toFold = conversation.messages.slice(conversation.summarisedUpTo, keepFrom);
  if (toFold.length === 0) return;

  const transcript = toFold
    .map((m) => `${m.role === 'user' ? 'Learner' : 'Mochi'}: ${m.content}`)
    .join('\n');

  const previous = conversation.summary ? `${conversation.summary}\n\n` : '';
  const summary = await getProvider().summarise(previous + transcript, SUMMARISE_INSTRUCTION);

  conversation.summary = summary;
  conversation.summarisedUpTo = keepFrom;
  await conversation.save();
}

export async function getSession(userId: string, sessionId: string) {
  const conversation = await Conversation.findOne({ userId, sessionId }).lean();
  if (!conversation) throw AppError.notFound('That conversation is gone.');
  const profile = await Profile.findOne({ userId }).lean();

  return {
    sessionId,
    level: profile?.level ?? 'A1',
    messages: conversation.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      ts: m.ts,
      ...(m.corrections?.length ? { corrections: m.corrections } : {}),
    })),
  };
}

export function levelSnapshot(xp: number) {
  return levelFromXp(xp);
}
