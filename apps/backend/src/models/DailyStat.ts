import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/** Nightly rollup of `events`. This is what the dashboard reads. */
const dailyStatSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    localDate: { type: String, required: true },
    minutes: { type: Number, default: 0 },
    messages: { type: Number, default: 0 },
    corrections: { type: Number, default: 0 },
    wordsLearned: { type: Number, default: 0 },
    missionsCompleted: { type: Number, default: 0 },
    xp: { type: Number, default: 0 },
  },
  { timestamps: true },
);

dailyStatSchema.index({ userId: 1, localDate: 1 }, { unique: true });

export type DailyStatDoc = HydratedDocument<InferSchemaType<typeof dailyStatSchema>>;
export const DailyStat = model('DailyStat', dailyStatSchema);
