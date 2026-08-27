import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { CEFR_LEVELS, SKILLS, TARGET_EXAMS } from '@pet/shared';

const skills = new Schema(
  Object.fromEntries(SKILLS.map((s) => [s, { type: Number, default: 0, min: 0, max: 100 }])),
  { _id: false },
);

const streak = new Schema(
  {
    current: { type: Number, default: 0, min: 0 },
    longest: { type: Number, default: 0, min: 0 },
    lastActiveLocalDate: { type: String, default: null },
  },
  { _id: false },
);

const profileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    level: { type: String, enum: CEFR_LEVELS, default: 'A1' },
    targetLevel: { type: String, enum: CEFR_LEVELS, default: 'B2' },
    targetExam: { type: String, enum: TARGET_EXAMS, default: 'NONE' },
    dailyGoalMinutes: { type: Number, default: 30, min: 5, max: 240 },

    /** Null until onboarding finishes. currentDay is derived from it, never stored. */
    planStartDate: { type: String, default: null },

    xp: { type: Number, default: 0, min: 0 },

    /**
     * ISO week in which the streak's grace day was spent, e.g. "2026-W35".
     * Stored as the week rather than a boolean plus a weekly reset job, so the
     * reset is derived and cannot drift when a job is missed.
     */
    graceUsedWeek: { type: String, default: null },
    streak: { type: streak, default: () => ({}) },
    skills: { type: skills, default: () => ({}) },
  },
  { timestamps: true },
);

export type ProfileDoc = HydratedDocument<InferSchemaType<typeof profileSchema>>;
export const Profile = model('Profile', profileSchema);
