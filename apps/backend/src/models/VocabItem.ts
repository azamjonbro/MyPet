import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * Words the tutor taught, kept as rows rather than only as a counter.
 *
 * The count alone was enough for the dashboard, but a word list is what the
 * learner actually wants to keep — and it is what Notion exports (§I). One row
 * per learner per word: teaching "commute" twice is not two words learned.
 */
const vocabItemSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** Lower-cased key for the unique index; `word` keeps the original casing. */
    key: { type: String, required: true },
    word: { type: String, required: true },
    definition: { type: String, required: true },
    example: { type: String, required: true },
    localDate: { type: String, required: true },
    messageId: { type: String, default: null },
    notionPageId: { type: String, default: null },
  },
  { timestamps: true },
);

vocabItemSchema.index({ userId: 1, key: 1 }, { unique: true });
vocabItemSchema.index({ userId: 1, createdAt: -1 });

export type VocabItemDoc = HydratedDocument<InferSchemaType<typeof vocabItemSchema>>;
export const VocabItem = model('VocabItem', vocabItemSchema);
