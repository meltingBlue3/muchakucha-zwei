import { addDays, formatIsoDate, localDateTimeToInstant, parseIsoDate } from '../recurrence/recurrence-date.js';

/**
 * Wall-clock views of stored instants. The model reasons in the user's zone, so it receives local
 * dates and weekdays instead of converting UTC timestamps itself; storage stays UTC.
 */
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;

interface WallClock { date: string; time: string; offset: string }

function wallClock(instant: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? '';
  // Intl renders a zero offset as a bare "GMT".
  const offset = part('timeZoneName').replace(/^(GMT|UTC)/, '') || '+00:00';
  return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}`, offset: `UTC${offset}` };
}

function weekday(date: string): string {
  const { year, month, day } = parseIsoDate(date);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]!;
}

export function describeNow(timeZone: string, now: Date = new Date()): string {
  const clock = wallClock(now, timeZone);
  return `${clock.date} ${weekday(clock.date)} ${clock.time}（${timeZone}，${clock.offset}）`;
}

export function localDateOf(instant: string | Date, timeZone: string): string {
  return wallClock(new Date(instant), timeZone).date;
}

/** `due` shows local midnight as a bare date: the app stores a due date without a time that way. */
export function localStamp(instant: string, timeZone: string, mode: 'datetime' | 'date' | 'due' = 'datetime'): string {
  const clock = wallClock(new Date(instant), timeZone);
  const day = `${clock.date} ${weekday(clock.date)}`;
  return mode === 'date' || (mode === 'due' && clock.time === '00:00') ? day : `${day} ${clock.time}`;
}

export function shiftDate(date: string, days: number): string {
  return formatIsoDate(addDays(parseIsoDate(date), days));
}

export function localMidnight(date: string, timeZone: string): Date {
  return localDateTimeToInstant(parseIsoDate(date), 0, 0, timeZone);
}

/** The app stores an all-day event as local 00:00:00 through 23:59:59 of its last day. */
export function allDayBounds(startTime: string | undefined, endTime: string | undefined, timeZone: string): { startTime?: string; endTime?: string } {
  const result: { startTime?: string; endTime?: string } = {};
  if (startTime !== undefined) result.startTime = localMidnight(localDateOf(startTime, timeZone), timeZone).toISOString();
  if (endTime !== undefined) {
    let last = localDateOf(endTime, timeZone);
    // A midnight end means "until the next day began", not one more whole day.
    if (wallClock(new Date(endTime), timeZone).time === '00:00' && (startTime === undefined || Date.parse(endTime) > Date.parse(startTime))) last = shiftDate(last, -1);
    result.endTime = new Date(localMidnight(shiftDate(last, 1), timeZone).getTime() - 1000).toISOString();
  }
  return result;
}
