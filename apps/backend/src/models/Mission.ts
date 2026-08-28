import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { CEFR_LEVELS, GRAMMAR_TOPICS, SKILLS, TASK_KINDS } from '@pet/shared';

const task = new Schema(
  {
    id: { type: String, required: true },
    kind: { type: String, enum: TASK_KINDS, required: true },
    skill: { type: String, enum: SKILLS, required: true },
    title: { type: String, required: true },
    detail: { type: String, required: true },
    topicId: { type: String, enum: GRAMMAR_TOPICS, default: null },
    /** `usewords` tasks only: what was asked for, and what has been used so far. */
    words: { type: [String], default: undefined },
    usedWords: { type: [String], default: undefined },
    target: { type: Number, required: true, min: 1 },
    progress: { type: Number, default: 0, min: 0 },
    done: { type: Boolean, default: false },
    xp: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

/**
 * One mission per learner per local day.
 *
 * Generated on first read rather than by a nightly job: a job would have to
 * guess every learner's timezone and would produce missions nobody opens.
 * The unique index is what makes "generate on read" safe under concurrency —
 * two tabs asking at once produce one mission, not two.
 */
const missionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    localDate: { type: String, required: true },
    planDay: { type: Number, default: 0 },
    level: { type: String, enum: CEFR_LEVELS, required: true },
    title: { type: String, required: true },
    focus: { type: String, required: true },
    tasks: { type: [task], default: [] },
    status: { type: String, enum: ['active', 'complete'], default: 'active' },
    completedAt: { type: Date, default: null },
    xpAwarded: { type: Number, default: 0 },
    source: { type: String, enum: ['ai', 'template'], default: 'template' },
    notionPageId: { type: String, default: null },
  },
  { timestamps: true },
);

missionSchema.index({ userId: 1, localDate: 1 }, { unique: true });

export type MissionDoc = HydratedDocument<InferSchemaType<typeof missionSchema>>;
export const Mission = model('Mission', missionSchema);
