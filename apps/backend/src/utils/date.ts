/**
 * Days are the learner's days, not UTC days.
 *
 * The boundary sits at 04:00 local so that somebody practising at half past
 * midnight is still finishing yesterday rather than starting today — which is
 * what a person means by "I studied last night".
 */
export const DAY_BOUNDARY_HOUR = 4;

export function localDate(timezone: string, at: Date = new Date()): string {
  const shifted = new Date(at.getTime() - DAY_BOUNDARY_HOUR * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(shifted);
  return parts; // en-CA formats as YYYY-MM-DD
}

/**
 * The plain calendar date where the learner is, with no 04:00 shift.
 *
 * Reminders and clocks must use this rather than `localDate`: somebody setting
 * an alarm for 01:30 means half past one tonight, not "yesterday" — the
 * study-day boundary is an accounting rule and has no business in a clock.
 */
export function calendarDate(timezone: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

export function daysBetween(fromLocalDate: string, toLocalDate: string): number {
  const a = Date.parse(`${fromLocalDate}T00:00:00Z`);
  const b = Date.parse(`${toLocalDate}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function addDays(localDateStr: string, days: number): string {
  const d = new Date(Date.parse(`${localDateStr}T00:00:00Z`) + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** Plan day is derived from the start date, never stored as an incrementing counter. */
export function planDayFor(planStartDate: string | null, todayLocal: string, maxDay = 90): number {
  if (!planStartDate) return 0;
  const diff = daysBetween(planStartDate, todayLocal);
  if (diff < 0) return 0;
  return Math.min(maxDay, diff + 1);
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
