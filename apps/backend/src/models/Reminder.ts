import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * A reminder the learner asked for in their own words.
 *
 * `dueAtLocal` is wall-clock text, not a timestamp, on purpose: somebody who
 * says "remind me at seven" means seven where they are, even if they fly
 * somewhere else before then. The scheduler compares it against the learner's
 * current local time, so the reminder follows the person rather than a moment
 * frozen in UTC.
 */
const reminderSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, maxlength: 90 },
    dueAtLocal: { type: String, required: true },
    delivered: { type: Boolean, default: false },
    deliveredAt: { type: Date, default: null },
  },
  { timestamps: true },
);

reminderSchema.index({ userId: 1, delivered: 1, dueAtLocal: 1 });
// A delivered reminder is history, not data anybody needs a year later.
reminderSchema.index({ createdAt: 1 }, { expireAfterSeconds: 120 * 24 * 60 * 60 });

export type ReminderDoc = HydratedDocument<InferSchemaType<typeof reminderSchema>>;
export const Reminder = model('Reminder', reminderSchema);
