import { z } from 'zod';

/**
 * The learner's own word list.
 *
 * Two things live in one list on purpose: words Mocha taught, and words the
 * learner asked to learn. They are the same object to the learner — "words I
 * am working on" — and keeping them apart would mean two lists, two exports
 * and two places to look for the same word.
 */
export const WORD_SOURCES = ['tutor', 'learner'] as const;
export type WordSource = (typeof WORD_SOURCES)[number];

export const WORD_STATUSES = ['learning', 'known'] as const;
export type WordStatus = (typeof WORD_STATUSES)[number];

/** How many words the tutor is told about in one turn. More would crowd out the conversation. */
export const WORDS_IN_PROMPT = 6;

export const studyWordSchema = z.object({
  id: z.string(),
  word: z.string(),
  /** The learner's own note — a translation, usually. Empty for tutor words. */
  note: z.string(),
  definition: z.string(),
  example: z.string(),
  source: z.enum(WORD_SOURCES),
  status: z.enum(WORD_STATUSES),
  /** How many times the learner has actually used it in a message. */
  timesUsed: z.number().int().min(0),
  lastUsedAt: z.string().nullable(),
  addedOn: z.string(),
});
export type StudyWord = z.infer<typeof studyWordSchema>;

export const addWordsRequestSchema = z.object({
  /**
   * Accepts a list, because a learner adding words has a list in front of
   * them — from a lesson, a film, a page they just read — not one word.
   */
  words: z
    .array(
      z.object({
        word: z.string().trim().min(1).max(60),
        note: z.string().trim().max(120).optional(),
      }),
    )
    .min(1)
    .max(30),
});
export type AddWordsRequest = z.infer<typeof addWordsRequestSchema>;

export const updateWordSchema = z.object({
  status: z.enum(WORD_STATUSES).optional(),
  note: z.string().trim().max(120).optional(),
});
export type UpdateWordRequest = z.infer<typeof updateWordSchema>;

export const wordListResponseSchema = z.object({
  words: z.array(studyWordSchema),
  counts: z.object({
    learning: z.number().int().min(0),
    known: z.number().int().min(0),
  }),
});
export type WordListResponse = z.infer<typeof wordListResponseSchema>;
