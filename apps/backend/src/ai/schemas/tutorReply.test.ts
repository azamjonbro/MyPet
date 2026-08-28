import { describe, expect, it } from 'vitest';
import { tutorReplySchema, correctionSchema, vocabItemSchema } from '@pet/shared';
import { TUTOR_REPLY_JSON_SCHEMA } from './tutorReply.js';

/**
 * The model is steered by the JSON Schema but the response is validated by the
 * zod schema. If the two drift, the model returns something we then reject —
 * a failure that only shows up in production. These tests make drift a red test.
 */
describe('tutor reply schema', () => {
  it('describes the same top-level fields as the zod schema', () => {
    expect(Object.keys(TUTOR_REPLY_JSON_SCHEMA.properties).sort()).toEqual(
      Object.keys(tutorReplySchema.shape).sort(),
    );
  });

  it('requires every field, as OpenAI strict mode demands', () => {
    expect([...TUTOR_REPLY_JSON_SCHEMA.required].sort()).toEqual(
      Object.keys(TUTOR_REPLY_JSON_SCHEMA.properties).sort(),
    );
  });

  it('keeps reply first so the stream extractor can find it early', () => {
    expect(Object.keys(TUTOR_REPLY_JSON_SCHEMA.properties)[0]).toBe('reply');
    expect(TUTOR_REPLY_JSON_SCHEMA.required[0]).toBe('reply');
  });

  it('describes corrections with the same fields as the zod schema', () => {
    expect(Object.keys(TUTOR_REPLY_JSON_SCHEMA.properties.corrections.items.properties).sort())
      .toEqual(Object.keys(correctionSchema.shape).sort());
  });

  it('describes vocab items with the same fields as the zod schema', () => {
    expect(Object.keys(TUTOR_REPLY_JSON_SCHEMA.properties.newVocab.items.properties).sort())
      .toEqual(Object.keys(vocabItemSchema.shape).sort());
  });

  it('accepts a well-formed model response', () => {
    const parsed = tutorReplySchema.safeParse({
      reply: 'Almost correct!',
      corrections: [
        {
          original: 'I goed',
          corrected: 'I went',
          topicId: 'PAST_SIMPLE_IRREGULAR',
          explanation: 'Go is irregular: go became went.',
          severity: 'major',
        },
      ],
      newVocab: [],
      followUp: 'I ___ to the store yesterday.',
      signals: { userStruggling: false, suggestLevelUp: false },
      action: { type: 'NONE', title: null, dueAtLocal: null, minutes: null, words: null },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a topic outside the closed taxonomy', () => {
    const parsed = tutorReplySchema.safeParse({
      reply: 'hi',
      corrections: [
        { original: 'a', corrected: 'b', topicId: 'MADE_UP_TOPIC', explanation: 'x', severity: 'minor' },
      ],
      newVocab: [],
      followUp: null,
      signals: { userStruggling: false, suggestLevelUp: false },
      action: { type: 'NONE', title: null, dueAtLocal: null, minutes: null, words: null },
    });
    expect(parsed.success).toBe(false);
  });
});
