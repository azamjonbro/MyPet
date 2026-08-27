import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/** Token accounting per learner per local day, for the pre-call budget check. */
const dailyUsageSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    localDate: { type: String, required: true },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    calls: { type: Number, default: 0 },
  },
  { timestamps: true },
);

dailyUsageSchema.index({ userId: 1, localDate: 1 }, { unique: true });

export type DailyUsageDoc = HydratedDocument<InferSchemaType<typeof dailyUsageSchema>>;
export const DailyUsage = model('DailyUsage', dailyUsageSchema);
