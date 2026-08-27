import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { GRAMMAR_TOPICS } from '@pet/shared';

const correction = new Schema(
  {
    original: { type: String, required: true },
    corrected: { type: String, required: true },
    topicId: { type: String, enum: GRAMMAR_TOPICS, required: true },
    explanation: { type: String, required: true },
    severity: { type: String, enum: ['minor', 'major'], default: 'minor' },
  },
  { _id: false },
);

const message = new Schema(
  {
    id: { type: String, required: true },
    role: { type: String, enum: ['user', 'pet'], required: true },
    content: { type: String, required: true },
    ts: { type: Number, required: true },
    corrections: { type: [correction], default: undefined },
  },
  { _id: false },
);

const conversationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sessionId: { type: String, required: true },

    /** Trimmed, never unbounded — see §J. Older turns live in `summary`. */
    messages: { type: [message], default: [] },
    summary: { type: String, default: null },
    /** How many messages from the start have already been folded into `summary`. */
    summarisedUpTo: { type: Number, default: 0 },
  },
  { timestamps: true },
);

conversationSchema.index({ userId: 1, sessionId: 1 }, { unique: true });
conversationSchema.index({ userId: 1, updatedAt: -1 });

export type ConversationDoc = HydratedDocument<InferSchemaType<typeof conversationSchema>>;
export const Conversation = model('Conversation', conversationSchema);
