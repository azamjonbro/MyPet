/**
 * ISO week key for a local date, e.g. "2026-W35".
 *
 * The streak's grace day is one per week; storing which week it was spent in
 * (rather than a boolean plus a reset job) means the reset is derived and
 * cannot drift when a job is missed.
 */
export function isoWeek(localDate: string): string {
  const date = new Date(`${localDate}T00:00:00Z`);
  const day = date.getUTCDay() || 7; // Monday = 1 … Sunday = 7
  date.setUTCDate(date.getUTCDate() + 4 - day); // shift to the week's Thursday
  const year = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstDay = firstThursday.getUTCDay() || 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 4 - firstDay);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${year}-W${String(week).padStart(2, '0')}`;
}
