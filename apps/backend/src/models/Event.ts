import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * Append-only analytics log.
 *
 * Everything in §17 is derived from this rather than counted live. Incrementing
 * counters means every metric you invent later starts at zero on the day you
 * add it; an event log plus a rollup means a new metric can be backfilled over
 * the whole history.
 */
export const EVENT_TYPES = [
  'chat.message',
  'correction.received',
  'vocab.learned',
  'practice.minutes',
  'mission.task.progress',
  'mission.completed',
  'xp.awarded',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

const eventSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: EVENT_TYPES, required: true },
    localDate: { type: String, required: true },
    /** Small, type-specific numbers. Never free-form learner text. */
    value: { type: Number, default: 1 },
    meta: { type: Schema.Types.Mixed, default: undefined },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

eventSchema.index({ userId: 1, localDate: 1, type: 1 });
eventSchema.index({ userId: 1, createdAt: -1 });
// Raw events are only needed until they have been rolled up and re-derived.
eventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 400 * 24 * 60 * 60 });

export type EventDoc = HydratedDocument<InferSchemaType<typeof eventSchema>>;
export const Event = model('Event', eventSchema);
