import { GRAMMAR_TOPICS } from '@pet/shared';

/**
 * The JSON Schema handed to the model for strict structured output.
 *
 * It is written by hand rather than generated, because OpenAI's strict mode has
 * requirements (`additionalProperties: false`, every property listed in
 * `required`) that a generic converter does not reliably produce. The zod
 * schema in @pet/shared still validates whatever comes back, and a test asserts
 * the two never drift apart.
 */
export const TUTOR_REPLY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  // `reply` first: the stream extractor depends on it arriving before the rest.
  required: ['reply', 'corrections', 'newVocab', 'followUp', 'signals'],
  properties: {
    reply: {
      type: 'string',
      description: 'What the pet says. Already at the learner\'s level. No markdown.',
    },
    corrections: {
      type: 'array',
      description: 'Mistakes in the learner\'s message. Empty if there were none. Never invent one.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['original', 'corrected', 'topicId', 'explanation', 'severity'],
        properties: {
          original: { type: 'string', description: 'The learner\'s exact wrong words.' },
          corrected: { type: 'string', description: 'The same words, fixed.' },
          topicId: { type: 'string', enum: [...GRAMMAR_TOPICS] },
          explanation: { type: 'string', description: 'One short sentence, at the learner\'s level.' },
          severity: { type: 'string', enum: ['minor', 'major'] },
        },
      },
    },
    newVocab: {
      type: 'array',
      description: 'New words you taught in this reply. Empty if none.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['word', 'definition', 'example'],
        properties: {
          word: { type: 'string' },
          definition: { type: 'string' },
          example: { type: 'string' },
        },
      },
    },
    followUp: {
      type: ['string', 'null'],
      description: 'A small thing for the learner to try, e.g. "I ___ to the store yesterday."',
    },
    signals: {
      type: 'object',
      additionalProperties: false,
      required: ['userStruggling', 'suggestLevelUp'],
      properties: {
        userStruggling: { type: 'boolean' },
        suggestLevelUp: { type: 'boolean' },
      },
    },
  },
} as const;
