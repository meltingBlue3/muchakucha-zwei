/** Pure calendar arithmetic. No Nest, no Prisma, no I/O. */
export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export interface WalkRule {
  freq: string;
  interval: number;
  startsOn: CalendarDate;
  endsOn?: CalendarDate | null;
  count?: number | null;
}

export function parseIsoDate(iso: string): CalendarDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match === null) throw new Error('invalid ISO calendar date');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error('invalid ISO calendar date');
  }
  return { year, month, day };
}

export function formatIsoDate(date: CalendarDate): string {
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function compareDates(left: CalendarDate, right: CalendarDate): number {
  return formatIsoDate(left).localeCompare(formatIsoDate(right));
}

export function addDays(from: CalendarDate, amount: number): CalendarDate {
  let year = from.year;
  let month = from.month;
  let day = from.day;
  const direction = Math.sign(amount);
  for (let remaining = Math.abs(amount); remaining > 0; remaining -= 1) {
    day += direction;
    if (direction > 0 && day > daysInMonth(year, month)) {
      day = 1;
      month += 1;
      if (month > 12) { month = 1; year += 1; }
    } else if (direction < 0 && day < 1) {
      month -= 1;
      if (month < 1) { month = 12; year -= 1; }
      day = daysInMonth(year, month);
    }
  }
  return { year, month, day };
}

export function walkOccurrences(rule: WalkRule, options: { horizon: CalendarDate }): CalendarDate[] {
  if (rule.freq !== 'daily') throw new Error('unsupported frequency');
  const occurrences: CalendarDate[] = [];
  let current = rule.startsOn;
  while (compareDates(current, options.horizon) <= 0 &&
    (rule.endsOn == null || compareDates(current, rule.endsOn) <= 0) &&
    (rule.count == null || occurrences.length < rule.count)) {
    occurrences.push(current);
    current = addDays(current, rule.interval);
  }
  return occurrences;
}

function offsetMinutesAt(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const zone = parts.find((part) => part.type === 'timeZoneName')?.value;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(zone ?? '');
  if (match === null) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

export function localDateTimeToInstant(date: CalendarDate, hour: number, minute: number, timeZone: string): Date {
  const naive = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  const first = naive - offsetMinutesAt(naive, timeZone) * 60_000;
  return new Date(naive - offsetMinutesAt(first, timeZone) * 60_000);
}
