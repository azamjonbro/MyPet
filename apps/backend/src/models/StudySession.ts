import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * A block of study the learner explicitly started and ended.
 *
 * Deliberately explicit: the app never infers studying from the computer being
 * on, or from which pages are open. A session exists because somebody said
 * "let's go" — which is also what makes the minutes worth counting.
 */
const studySessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: String, default: 'English', maxlength: 60 },
    localDate: { type: String, required: true },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    plannedMinutes: { type: Number, default: 30 },
    minutes: { type: Number, default: 0 },
  },
  { timestamps: true },
);

studySessionSchema.index({ userId: 1, endedAt: 1 });
studySessionSchema.index({ userId: 1, localDate: 1 });

export type StudySessionDoc = HydratedDocument<InferSchemaType<typeof studySessionSchema>>;
export const StudySession = model('StudySession', studySessionSchema);
