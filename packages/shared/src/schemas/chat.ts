import { z } from 'zod';
import { GRAMMAR_TOPICS } from '../constants/grammarTopics.js';
import { CEFR_LEVELS } from '../constants/cefr.js';

/**
 * The tutor's structured output.
 *
 * §7 needs the correction stored as data — original, corrected, topic — so the
 * weakness ledger can rank it later. Parsing that back out of prose works in
 * testing and fails in production, so the model returns both the visible reply
 * and the machine-readable record in one call.
 *
 * `reply` is deliberately the FIRST field: the stream extractor reads it out of
 * the partial JSON as it arrives, so the learner sees words appearing rather
 * than a spinner followed by a wall of text.
 */
export const correctionSchema = z.object({
  original: z.string().min(1).max(300),
  corrected: z.string().min(1).max(300),
  topicId: z.enum(GRAMMAR_TOPICS),
  explanation: z.string().min(1).max(400),
  severity: z.enum(['minor', 'major']),
});
export type Correction = z.infer<typeof correctionSchema>;

export const vocabItemSchema = z.object({
  word: z.string().min(1).max(60),
  definition: z.string().min(1).max(200),
  example: z.string().min(1).max(200),
});
export type VocabItem = z.infer<typeof vocabItemSchema>;

export const tutorReplySchema = z.object({
  reply: z.string().min(1).max(1200),
  corrections: z.array(correctionSchema).max(4),
  newVocab: z.array(vocabItemSchema).max(5),
  followUp: z.string().max(300).nullable(),
  signals: z.object({
    userStruggling: z.boolean(),
    suggestLevelUp: z.boolean(),
  }),
});
export type TutorReply = z.infer<typeof tutorReplySchema>;

export const chatMessageRequestSchema = z.object({
  sessionId: z.string().min(1).max(64).optional(),
  text: z.string().trim().min(1, 'Say something first.').max(2000),
});
export type ChatMessageRequest = z.infer<typeof chatMessageRequestSchema>;

export const chatRoleSchema = z.enum(['user', 'pet']);
export type ChatRole = z.infer<typeof chatRoleSchema>;

export const chatMessageSchema = z.object({
  id: z.string(),
  role: chatRoleSchema,
  content: z.string(),
  ts: z.number().int(),
  corrections: z.array(correctionSchema).optional(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatSessionSchema = z.object({
  sessionId: z.string(),
  messages: z.array(chatMessageSchema),
  level: z.enum(CEFR_LEVELS),
});
export type ChatSession = z.infer<typeof chatSessionSchema>;

/** Server-sent event frames on POST /chat/message. */
export type ChatStreamEvent =
  | { type: 'open'; sessionId: string }
  | { type: 'token'; text: string }
  | { type: 'corrections'; corrections: Correction[] }
  | { type: 'vocab'; items: VocabItem[] }
  | { type: 'done'; sessionId: string; xpAwarded: number; xpTotal: number; followUp: string | null }
  | { type: 'error'; code: string; message: string };
