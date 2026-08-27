import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const notificationSettings = new Schema(
  {
    missionReminder: { type: Boolean, default: true },
    reminderHour: { type: Number, default: 19, min: 0, max: 23 },
    streakAtRisk: { type: Boolean, default: true },
    arrivalToast: { type: Boolean, default: true },
    quietMode: { type: Boolean, default: false },
  },
  { _id: false },
);

const settings = new Schema(
  {
    petEnabled: { type: Boolean, default: true },
    petSkin: { type: String, default: 'mochi' },
    notifications: { type: notificationSettings, default: () => ({}) },
    blockedHosts: { type: [String], default: [] },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    googleId: { type: String, sparse: true, unique: true },
    displayName: { type: String, required: true, trim: true, maxlength: 80 },
    avatarUrl: { type: String },
    timezone: { type: String, default: 'UTC' },
    settings: { type: settings, default: () => ({}) },
  },
  { timestamps: true },
);

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;
export const User = model('User', userSchema);
