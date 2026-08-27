/**
 * CEFR levels and the voice rules the tutor must obey at each one.
 *
 * These constraints are DATA, not prose baked into a prompt file, so that
 * tuning how A1 sounds is a one-line edit rather than a prompt rewrite.
 * Consumed by the backend when assembling the system prompt (§G of the audit).
 */

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export interface LevelVoice {
  /** Hard ceiling on sentence length the model is told to respect. */
  maxSentenceWords: number;
  /** Grammar the tutor may use freely when speaking to the learner. */
  allowedGrammar: string;
  /** New words to introduce per turn. */
  newWordsPerTurn: number;
  /** Extra instructions appended to the system prompt. */
  rules: string[];
}

export const LEVEL_VOICE: Record<CefrLevel, LevelVoice> = {
  A1: {
    maxSentenceWords: 12,
    allowedGrammar: 'present simple, past simple, "there is/are", basic questions',
    newWordsPerTurn: 1,
    rules: [
      'Use very simple, common words only.',
      'No idioms, no phrasal verbs, no passive voice.',
      'Give a concrete example after every explanation.',
      'Always finish with one small thing for the learner to try.',
    ],
  },
  A2: {
    maxSentenceWords: 16,
    allowedGrammar: 'all simple tenses, present continuous, going to, comparatives',
    newWordsPerTurn: 2,
    rules: [
      'Keep vocabulary everyday and concrete.',
      'At most one phrasal verb per reply, and explain it.',
      'Always finish with a question or a small task.',
    ],
  },
  B1: {
    maxSentenceWords: 20,
    allowedGrammar: 'perfect tenses, first and second conditional, modals',
    newWordsPerTurn: 3,
    rules: [
      'Introduce useful collocations and explain them briefly.',
      'Push the learner to give reasons, not just facts.',
    ],
  },
  B2: {
    maxSentenceWords: 26,
    allowedGrammar: 'all tenses, all conditionals, passive voice, reported speech',
    newWordsPerTurn: 4,
    rules: [
      'Correct register and naturalness, not only grammar.',
      'Ask for opinions and ask the learner to defend them.',
    ],
  },
  C1: {
    maxSentenceWords: 34,
    allowedGrammar: 'unrestricted',
    newWordsPerTurn: 5,
    rules: [
      'Focus on nuance, precision and idiomatic phrasing.',
      'Point out where a correct sentence is still not what a native would say.',
    ],
  },
  C2: {
    maxSentenceWords: 40,
    allowedGrammar: 'unrestricted',
    newWordsPerTurn: 5,
    rules: [
      'Treat the learner as near-native; focus on style, tone and rhetoric.',
      'Only flag genuine errors — do not invent corrections.',
    ],
  },
};

export const TARGET_EXAMS = ['NONE', 'IELTS', 'TOEFL', 'CEFR'] as const;
export type TargetExam = (typeof TARGET_EXAMS)[number];

/** Rank used to compare levels, e.g. when deciding whether to suggest a level-up. */
export function levelRank(level: CefrLevel): number {
  return CEFR_LEVELS.indexOf(level);
}
