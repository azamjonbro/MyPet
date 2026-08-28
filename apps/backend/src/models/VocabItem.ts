import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * The learner's words — both the ones Mocha taught and the ones they asked to
 * learn themselves.
 *
 * One collection rather than two, because to the learner these are one thing:
 * "words I am working on". `source` is the only difference, and it exists so
 * the tutor can tell "I taught you this" from "you asked me for this".
 *
 * One row per learner per word: teaching "commute" twice is not two words.
 */
const vocabItemSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** Lower-cased key for the unique index; `word` keeps the original casing. */
    key: { type: String, required: true },
    word: { type: String, required: true },
    // A word the learner added has no definition until the tutor gives it one.
    definition: { type: String, default: '' },
    example: { type: String, default: '' },
    /** The learner's own note — a translation, usually. Empty for tutor words. */
    note: { type: String, default: '' },
    source: { type: String, enum: ['tutor', 'learner'], default: 'tutor' },
    status: { type: String, enum: ['learning', 'known'], default: 'learning' },
    /** How many times the learner has actually used it in a message of their own. */
    timesUsed: { type: Number, default: 0 },
    lastUsedAt: { type: Date, default: null },
    localDate: { type: String, required: true },
    messageId: { type: String, default: null },
    notionPageId: { type: String, default: null },
  },
  { timestamps: true },
);

vocabItemSchema.index({ userId: 1, key: 1 }, { unique: true });
vocabItemSchema.index({ userId: 1, createdAt: -1 });
// The prompt asks for "words still being learned, least used first" every turn.
vocabItemSchema.index({ userId: 1, status: 1, timesUsed: 1 });

export type VocabItemDoc = HydratedDocument<InferSchemaType<typeof vocabItemSchema>>;
export const VocabItem = model('VocabItem', vocabItemSchema);
