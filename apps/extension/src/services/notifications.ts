import type { MeResponse } from '@pet/shared';
import { api } from './api.js';
import { localStore } from './storage.js';

/**
 * Reminders.
 *
 * The rule this file exists to enforce: **at most two notifications a day, at
 * an hour the learner chose.** A study app that pings whenever it has an
 * excuse gets its notifications switched off in a week, and then it cannot
 * reach the learner at all — so the restraint here is what keeps the channel
 * alive rather than politeness.
 */
export const HOURLY_ALARM = 'pet-hourly';

export const MISSION_NOTIFICATION = 'mission-due';
export const STREAK_NOTIFICATION = 'streak-at-risk';

/** After the chosen hour we still nudge, but only for a while, and never late. */
const REMINDER_WINDOW_HOURS = 3;
const NIGHT_CUTOFF_HOUR = 22;
const STREAK_HOUR = 20;
const MORNING_HOUR = 7;

export interface ReminderInput {
  hour: number;
  date: string;
  settings: MeResponse['user']['settings']['notifications'];
  log: { missionDate: string | null; streakDate: string | null };
}

/**
 * Which reminders are due right now — pure, so the whole policy is testable
 * without a browser: the hour window, the night cut-off, quiet mode, and the
 * once-a-day rule are the product decision here, not the chrome.* plumbing.
 */
export function dueReminders(input: ReminderInput): { mission: boolean; streak: boolean } {
  const { hour, date, settings, log } = input;
  if (settings.quietMode) return { mission: false, streak: false };
  if (hour >= NIGHT_CUTOFF_HOUR || hour < MORNING_HOUR) return { mission: false, streak: false };

  return {
    mission:
      settings.missionReminder &&
      hour >= settings.reminderHour &&
      hour < settings.reminderHour + REMINDER_WINDOW_HOURS &&
      log.missionDate !== date,
    streak: settings.streakAtRisk && hour >= STREAK_HOUR && log.streakDate !== date,
  };
}

export function ensureAlarms(): void {
  // An hourly beat, not a timer to the exact minute: MV3 wakes a terminated
  // worker for an alarm, and asking for a tighter period than a minute is
  // silently ignored by Chrome anyway.
  chrome.alarms.create(HOURLY_ALARM, { periodInMinutes: 60, delayInMinutes: 1 });
}

/** The learner's own clock, which is the only one that matters here. */
function localNow(timezone: string): { hour: number; date: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const hour = Number.parseInt(get('hour'), 10);
  return {
    // Intl gives midnight as "24" in some locales; normalise it.
    hour: Number.isNaN(hour) ? 0 : hour % 24,
    date: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

async function notify(id: string, title: string, message: string): Promise<void> {
  try {
    await chrome.notifications.create(id, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon/128.png'),
      title,
      message,
      priority: 1,
    });
  } catch {
    // Notifications are a nice-to-have; a refused one must never break the beat.
  }
}

export interface CheckOutcome {
  missionRemaining: number | null;
  streakAtRisk: boolean;
}

/**
 * One hourly pass. Returns what it found so the caller can also nudge any pet
 * that happens to be on screen — a bubble from the pet is a gentler nudge than
 * a system notification, and it costs the learner nothing.
 */
export async function runChecks(): Promise<CheckOutcome> {
  const outcome: CheckOutcome = { missionRemaining: null, streakAtRisk: false };

  const me = await localStore.getCachedMe<MeResponse>();
  if (!me) return outcome; // signed out: nothing to remind anybody about

  // The policy lives in dueReminders, in one piece, rather than being spread
  // between here and there.
  const settings = me.user.settings.notifications;
  const { hour, date } = localNow(me.user.timezone);
  const log = await localStore.getNotifyLog();
  const due = dueReminders({ hour, date, settings, log });
  if (!due.mission && !due.streak) return outcome;

  if (due.mission) {
    try {
      const { mission } = await api.missionToday();
      const remaining = mission.tasks.filter((task) => !task.done).length;
      outcome.missionRemaining = remaining;
      if (remaining > 0) {
        await notify(
          MISSION_NOTIFICATION,
          `Today: ${mission.title}`,
          remaining === 1
            ? 'One task left. Mochi is waiting.'
            : `${remaining} small tasks. It takes a few minutes.`,
        );
        log.missionDate = date;
      }
    } catch {
      // Backend down or signed out — try again next hour rather than nagging.
    }
  }

  if (due.streak) {
    try {
      const summary = await api.progressSummary();
      outcome.streakAtRisk = summary.streak.atRisk;
      if (summary.streak.atRisk) {
        await notify(
          STREAK_NOTIFICATION,
          `${summary.streak.current}-day streak`,
          'One message to Mochi keeps it alive.',
        );
        log.streakDate = date;
      }
    } catch {
      /* same again */
    }
  }

  await localStore.setNotifyLog(log);
  return outcome;
}

/**
 * A notification click opens the dashboard in a tab rather than the side panel:
 * `chrome.sidePanel.open` needs a user gesture in a window, and a click on a
 * system notification is not one Chrome will accept.
 */
export async function openDashboard(): Promise<void> {
  await chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html') });
}
