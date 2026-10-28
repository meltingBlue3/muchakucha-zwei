import { localDateTimeToInstant, type CalendarDate } from '../recurrence/recurrence-date.js';

/** How far ahead a phone schedules, and how many it keeps: iOS holds at most 64 local notifications per app. */
export const REMINDER_WINDOW_DAYS = 7;
export const REMINDER_LIMIT = 60;

export interface ReminderDefaults {
  taskMinutesBefore: number | null;
  eventMinutesBefore: number | null;
  dateOnlyTime: string;
  alarm: boolean;
}

export const DEFAULT_REMINDER_SETTINGS: ReminderDefaults = { taskMinutesBefore: 0, eventMinutesBefore: 15, dateOnlyTime: '09:00', alarm: false };

export interface ReminderCandidate {
  key: string;
  kind: 'task' | 'event';
  householdId: string;
  householdName: string;
  itemId: string | null;
  occurrenceDate: string | null;
  title: string;
  /** Due time of a task, start time of an event. */
  at: Date;
  /** Events only. A task counts as date-only when it is due at local midnight, as the task form stores it. */
  allDay: boolean;
  location: string | null;
  /** Undefined follows the defaults; null is a personal "no reminder". */
  minutesBefore: number | null | undefined;
  /** Null follows the defaults. */
  alarm: boolean | null;
}

export interface PlannedReminder extends Omit<ReminderCandidate, 'minutesBefore' | 'allDay' | 'alarm'> {
  dateOnly: boolean;
  fireAt: Date;
  alarm: boolean;
}

/** Calendar date and minutes past midnight of an instant on the wall clock of `timeZone`. */
export function wallClock(instant: Date, timeZone: string): { date: CalendarDate; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find(item => item.type === type)?.value);
  return { date: { year: part('year'), month: part('month'), day: part('day') }, minutes: part('hour') * 60 + part('minute') };
}

/**
 * Turns the reminders a person may receive into the ones a phone should
 * schedule now: in the coming window, nearest first, capped. A date-only item
 * counts back from the date-only time on its own day, so "the day before" is
 * the same 1440 minutes for both kinds of item; following the defaults it
 * fires at that time, since a default such as "15 minutes before" means
 * nothing without a time.
 */
export function planReminders(
  candidates: ReminderCandidate[],
  defaults: ReminderDefaults,
  options: { now: Date; timeZone: string; windowDays?: number; limit?: number },
): PlannedReminder[] {
  const [hour = 9, minute = 0] = defaults.dateOnlyTime.split(':').map(Number);
  const now = options.now.getTime();
  const until = now + (options.windowDays ?? REMINDER_WINDOW_DAYS) * 86_400_000;
  const planned: PlannedReminder[] = [];
  for (const { minutesBefore, allDay, alarm, ...candidate } of candidates) {
    const clock = wallClock(candidate.at, options.timeZone);
    const dateOnly = candidate.kind === 'event' ? allDay : clock.minutes === 0;
    // The date-only time is itself the default for an item without a time.
    const kindDefault = candidate.kind === 'task' ? defaults.taskMinutesBefore : defaults.eventMinutesBefore;
    const minutes = minutesBefore === undefined ? kindDefault === null ? null : dateOnly ? 0 : kindDefault : minutesBefore;
    if (minutes === null) continue;
    const anchor = dateOnly ? localDateTimeToInstant(clock.date, hour, minute, options.timeZone) : candidate.at;
    const fireAt = new Date(anchor.getTime() - minutes * 60_000);
    // A reminder whose moment has passed is not sent late.
    if (fireAt.getTime() <= now || fireAt.getTime() > until) continue;
    planned.push({ ...candidate, dateOnly, fireAt, alarm: alarm ?? defaults.alarm });
  }
  return planned
    .sort((left, right) => left.fireAt.getTime() - right.fireAt.getTime() || left.key.localeCompare(right.key))
    .slice(0, options.limit ?? REMINDER_LIMIT);
}
