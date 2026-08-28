import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { GRAMMAR_TOPICS } from '@pet/shared';

/**
 * The weakness ledger — tier 3 of the memory system.
 *
 * Retrieved by a ranked aggregation, not by similarity search: for "which
 * grammar does this learner keep getting wrong", a sorted count is both more
 * accurate and more debuggable than an embedding (§J).
 */
const mistakeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    messageId: { type: String, required: true },
    original: { type: String, required: true },
    corrected: { type: String, required: true },
    topicId: { type: String, enum: GRAMMAR_TOPICS, required: true },
    explanation: { type: String, required: true },
    severity: { type: String, enum: ['minor', 'major'], default: 'minor' },
    localDate: { type: String, required: true },
    resolved: { type: Boolean, default: false },
    notionPageId: { type: String, default: null },
  },
  { timestamps: true },
);

mistakeSchema.index({ userId: 1, topicId: 1 });
mistakeSchema.index({ userId: 1, createdAt: -1 });

export type MistakeDoc = HydratedDocument<InferSchemaType<typeof mistakeSchema>>;
export const Mistake = model('Mistake', mistakeSchema);
