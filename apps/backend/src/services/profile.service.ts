import type { Types } from 'mongoose';
import {
  levelFromXp,
  type MeResponse,
  type OnboardingRequest,
  type UpdateProfileRequest,
  type UpdateSettingsRequest,
} from '@pet/shared';
import { Profile, User, type ProfileDoc, type UserDoc } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { localDate, planDayFor } from '../utils/date.js';
import { isoWeek } from '../utils/week.js';

export async function ensureProfile(userId: Types.ObjectId): Promise<ProfileDoc> {
  const existing = await Profile.findOne({ userId });
  if (existing) return existing;
  return Profile.create({ userId });
}

/** Serialises user + profile into exactly the shape `meResponseSchema` describes. */
export function toMeResponse(user: UserDoc, profile: ProfileDoc): MeResponse {
  const today = localDate(user.timezone);
  const levelInfo = levelFromXp(profile.xp);
  // Mongoose types defaulted fields as optional. Collapse that here, once, so
  // the response always matches meResponseSchema exactly.
  const planStartDate = profile.planStartDate ?? null;
  const skill = (v: number | undefined) => v ?? 0;

  return {
    user: {
      id: user._id.toString(),
      email: user.email,
      displayName: user.displayName,
      timezone: user.timezone,
      settings: {
        petEnabled: user.settings.petEnabled,
        petSkin: user.settings.petSkin,
        notifications: {
          missionReminder: user.settings.notifications.missionReminder,
          reminderHour: user.settings.notifications.reminderHour,
          streakAtRisk: user.settings.notifications.streakAtRisk,
          arrivalToast: user.settings.notifications.arrivalToast,
          quietMode: user.settings.notifications.quietMode,
        },
        blockedHosts: [...user.settings.blockedHosts],
        accountability: {
          enabled: user.settings.accountability.enabled,
          intensity: user.settings.accountability.intensity as 'LOW' | 'NORMAL' | 'AGGRESSIVE',
          minMinutes: user.settings.accountability.minMinutes,
          cutoffHour: user.settings.accountability.cutoffHour,
          emailEnabled: user.settings.accountability.emailEnabled,
          email: user.settings.accountability.email,
        },
      },
    },
    profile: {
      level: profile.level,
      targetLevel: profile.targetLevel,
      targetExam: profile.targetExam,
      dailyGoalMinutes: profile.dailyGoalMinutes,
      planStartDate,
      currentDay: planDayFor(planStartDate, today),
      onboarded: profile.onboardedAt !== null && profile.onboardedAt !== undefined,
      xp: profile.xp,
      petLevel: levelInfo.level,
      petTitle: levelInfo.title,
      streak: {
        current: profile.streak.current,
        longest: profile.streak.longest,
        lastActiveLocalDate: profile.streak.lastActiveLocalDate ?? null,
        graceUsedThisWeek: profile.graceUsedWeek === isoWeek(today),
      },
      skills: {
        grammar: skill(profile.skills.grammar),
        vocabulary: skill(profile.skills.vocabulary),
        speaking: skill(profile.skills.speaking),
        listening: skill(profile.skills.listening),
        reading: skill(profile.skills.reading),
        writing: skill(profile.skills.writing),
      },
    },
  };
}

export async function getMe(userId: string): Promise<MeResponse> {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('That account no longer exists.');
  const profile = await ensureProfile(user._id);
  return toMeResponse(user, profile);
}

/**
 * Onboarding, and the only place the 90-day clock starts.
 *
 * Answered once, then the learner never sees it again — which is why it is a
 * separate call from PATCH /me/profile rather than a flag on it. A half-filled
 * onboarding leaves `onboardedAt` null, so the extension asks again rather than
 * starting a plan from guesses.
 */
export async function completeOnboarding(
  userId: string,
  input: OnboardingRequest,
): Promise<MeResponse> {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('That account no longer exists.');
  const profile = await ensureProfile(user._id);

  user.timezone = input.timezone;
  user.settings.notifications.reminderHour = input.reminderHour;

  profile.level = input.level;
  profile.targetLevel = input.targetLevel;
  profile.targetExam = input.targetExam;
  profile.dailyGoalMinutes = input.dailyGoalMinutes;
  profile.planStartDate ??= localDate(user.timezone);
  profile.onboardedAt ??= new Date();

  await Promise.all([user.save(), profile.save()]);
  return toMeResponse(user, profile);
}

/** Settings the learner owns: the pet, the notifications, the muted sites. */
export async function updateSettings(
  userId: string,
  patch: UpdateSettingsRequest,
): Promise<MeResponse> {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('That account no longer exists.');
  const profile = await ensureProfile(user._id);

  if (patch.petEnabled !== undefined) user.settings.petEnabled = patch.petEnabled;
  if (patch.petSkin !== undefined) user.settings.petSkin = patch.petSkin;
  if (patch.blockedHosts !== undefined) {
    // Normalised and de-duplicated here rather than trusted: this list is
    // matched against a hostname on every page load.
    user.settings.blockedHosts = [
      ...new Set(patch.blockedHosts.map((h) => h.trim().toLowerCase()).filter(Boolean)),
    ];
  }
  if (patch.notifications) {
    Object.assign(user.settings.notifications, patch.notifications);
  }
  if (patch.accountability) {
    Object.assign(user.settings.accountability, patch.accountability);
  }

  await user.save();
  return toMeResponse(user, profile);
}

export async function updateProfile(
  userId: string,
  patch: UpdateProfileRequest,
): Promise<MeResponse> {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('That account no longer exists.');
  const profile = await ensureProfile(user._id);

  if (patch.timezone) user.timezone = patch.timezone;
  if (patch.level) profile.level = patch.level;
  if (patch.targetLevel) profile.targetLevel = patch.targetLevel;
  if (patch.targetExam) profile.targetExam = patch.targetExam;
  if (patch.dailyGoalMinutes) profile.dailyGoalMinutes = patch.dailyGoalMinutes;

  // Finishing onboarding starts the 90-day clock.
  if (!profile.planStartDate && (patch.level || patch.targetLevel)) {
    profile.planStartDate = localDate(user.timezone);
  }

  await Promise.all([user.save(), profile.save()]);
  return toMeResponse(user, profile);
}
