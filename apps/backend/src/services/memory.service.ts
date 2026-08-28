import { Types } from 'mongoose';
import type { GrammarTopic } from '@pet/shared';
import { Mistake, type ConversationDoc, type ProfileDoc, type UserDoc } from '../models/index.js';
import { buildSystemPrompt } from '../ai/prompts/system.js';
import type { ProviderMessage } from '../ai/provider.js';
import { planDayFor } from '../utils/date.js';
import { wordsForPrompt } from './vocab.service.js';

/**
 * Tiered memory (§J). Assembled fresh every turn under a hard token ceiling.
 *
 *   Tier 0  learner profile        always present
 *   Tier 1  last N turns verbatim  working memory
 *   Tier 2  rolling summary        older turns, compressed
 *   Tier 3  weakness ledger        ranked DB query, not similarity search
 *
 * Resending the whole history is wrong for a sharper reason than cost: a model
 * given forty turns pays attention to the wrong ones.
 */
export const WORKING_MEMORY_TURNS = 8;
export const SUMMARISE_AFTER_TURNS = 16;
export const MAX_PROMPT_TOKENS = 1800;
export const TOP_WEAK_TOPICS = 3;
export const RECENT_MISTAKES = 3;

/** Cheap, provider-agnostic estimate. Good enough to enforce a ceiling. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface WeaknessRow {
  topicId: GrammarTopic;
  count: number;
  lastSeen: Date;
}

/** Tier 3: which grammar this learner keeps getting wrong, ranked. */
export async function topWeakTopics(userId: string, limit = TOP_WEAK_TOPICS): Promise<WeaknessRow[]> {
  const rows = await Mistake.aggregate<{ _id: GrammarTopic; count: number; lastSeen: Date }>([
    { $match: { userId: new Types.ObjectId(userId), resolved: false } },
    { $group: { _id: '$topicId', count: { $sum: 1 }, lastSeen: { $max: '$createdAt' } } },
    { $sort: { count: -1, lastSeen: -1 } },
    { $limit: limit },
  ]);
  return rows.map((r) => ({ topicId: r._id, count: r.count, lastSeen: r.lastSeen }));
}

export interface AssembledContext {
  systemPrompt: string;
  messages: ProviderMessage[];
  estimatedTokens: number;
}

export async function assembleContext(
  user: UserDoc,
  profile: ProfileDoc,
  conversation: ConversationDoc,
  todayLocal: string,
): Promise<AssembledContext> {
  const weak = await topWeakTopics(user._id.toString());
  const studyWords = await wordsForPrompt(user._id.toString());

  const recent = await Mistake.find({ userId: user._id, resolved: false })
    .sort({ createdAt: -1 })
    .limit(RECENT_MISTAKES)
    .select('original corrected topicId')
    .lean();

  const systemPrompt = buildSystemPrompt({
    level: profile.level,
    targetLevel: profile.targetLevel,
    targetExam: profile.targetExam,
    currentDay: planDayFor(profile.planStartDate ?? null, todayLocal),
    weakTopics: weak.map((w) => w.topicId),
    recentMistakes: recent.map((m) => ({
      original: m.original,
      corrected: m.corrected,
      topicId: m.topicId as GrammarTopic,
    })),
    summary: conversation.summary ?? null,
    displayName: user.displayName,
    studyWords,
  });

  // Tier 1: the most recent turns, verbatim.
  let window = conversation.messages
    .slice(-WORKING_MEMORY_TURNS * 2)
    .map<ProviderMessage>((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    }));

  // Enforce the ceiling by dropping the oldest turns, never by truncating text
  // mid-sentence — a half-sentence teaches the model the wrong thing.
  let total = estimateTokens(systemPrompt) + window.reduce((n, m) => n + estimateTokens(m.content), 0);
  while (total > MAX_PROMPT_TOKENS && window.length > 1) {
    const dropped = window[0]!;
    window = window.slice(1);
    total -= estimateTokens(dropped.content);
  }

  return { systemPrompt, messages: window, estimatedTokens: total };
}

export function shouldSummarise(conversation: ConversationDoc): boolean {
  return conversation.messages.length - conversation.summarisedUpTo > SUMMARISE_AFTER_TURNS;
}
