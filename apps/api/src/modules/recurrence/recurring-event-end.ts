import { addDays, localDateTimeToInstant, type CalendarDate } from './recurrence-date.js';

interface EventTiming {
  durationMinutes: number | null;
  startTimeLocal: string | null;
  templateAllDay: boolean;
  timezone: string;
}

export function recurringEventEnd(
  occurrence: CalendarDate,
  startTime: Date,
  rule: EventTiming,
  storedEnd?: Date,
): Date {
  const elapsedEnd = startTime.getTime() + (rule.durationMinutes ?? 0) * 60_000;
  if (!rule.templateAllDay || rule.durationMinutes !== 1440 || (rule.startTimeLocal ?? '00:00') !== '00:00') {
    return storedEnd ?? new Date(elapsedEnd);
  }

  // On read, only correct rows that match the old generated time span. An
  // individual occurrence may have been moved or given its own end time.
  if (storedEnd !== undefined && (storedEnd.getTime() !== elapsedEnd ||
    startTime.getTime() !== localDateTimeToInstant(occurrence, 0, 0, rule.timezone).getTime())) {
    return storedEnd;
  }

  // The rule stores whole minutes, while the event ends on the last second
  // of its local day. The time between two local midnights can vary with DST.
  const nextMidnight = localDateTimeToInstant(addDays(occurrence, 1), 0, 0, rule.timezone);
  return new Date(nextMidnight.getTime() - 1_000);
}
