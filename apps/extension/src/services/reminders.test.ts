import { describe, expect, it } from 'vitest';
import { dueReminders, type ReminderInput } from './notifications.js';

const settings = {
  missionReminder: true,
  reminderHour: 19,
  streakAtRisk: true,
  arrivalToast: true,
  quietMode: false,
};

const log: ReminderInput['log'] = { missionDate: null, streakDate: null };
const at = (hour: number, overrides: Partial<typeof settings> = {}, sent: ReminderInput['log'] = log) =>
  dueReminders({ hour, date: '2026-08-28', settings: { ...settings, ...overrides }, log: sent });

describe('when a reminder is due', () => {
  it('fires the mission reminder at the hour the learner chose', () => {
    expect(at(19).mission).toBe(true);
  });

  it('still catches a learner who was away for an hour or two', () => {
    expect(at(20).mission).toBe(true);
    expect(at(21).mission).toBe(true);
  });

  it('gives up rather than nagging at midnight', () => {
    expect(at(22).mission).toBe(false);
    expect(at(2).mission).toBe(false);
    expect(at(6).mission).toBe(false);
  });

  it('says nothing before the chosen hour', () => {
    expect(at(18).mission).toBe(false);
  });

  it('sends each reminder once a day, not once an hour', () => {
    const sent: ReminderInput['log'] = { missionDate: '2026-08-28', streakDate: null };
    expect(at(19, {}, sent).mission).toBe(false);
    // …and again tomorrow.
    expect(
      dueReminders({ hour: 19, date: '2026-08-29', settings, log: sent }).mission,
    ).toBe(true);
  });

  it('respects the switches, one at a time', () => {
    expect(at(19, { missionReminder: false }).mission).toBe(false);
    expect(at(21, { streakAtRisk: false }).streak).toBe(false);
    expect(at(21, { streakAtRisk: false }).mission).toBe(true);
  });

  it('says nothing at all in quiet mode', () => {
    expect(at(19, { quietMode: true })).toEqual({ mission: false, streak: false });
    expect(at(21, { quietMode: true })).toEqual({ mission: false, streak: false });
  });

  it('only warns about the streak in the evening', () => {
    expect(at(15).streak).toBe(false);
    expect(at(20).streak).toBe(true);
  });

  it('handles a learner who chose a late reminder hour', () => {
    // 23:00 chosen: the window would run past midnight, and the night cut-off
    // is what stops it rather than arithmetic on the hour.
    expect(at(23, { reminderHour: 23 }).mission).toBe(false);
  });
});
