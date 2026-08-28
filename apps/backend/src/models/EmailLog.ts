import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * One row per email actually sent.
 *
 * The unique index is the point: it is what makes "never email the same person
 * twice about the same day" a property of the database rather than of whichever
 * scheduler happens to be running.
 */
const emailLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: ['accountability'], required: true },
    localDate: { type: String, required: true },
    to: { type: String, required: true },
    sentAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

emailLogSchema.index({ userId: 1, kind: 1, localDate: 1 }, { unique: true });

export type EmailLogDoc = HydratedDocument<InferSchemaType<typeof emailLogSchema>>;
export const EmailLog = model('EmailLog', emailLogSchema);
