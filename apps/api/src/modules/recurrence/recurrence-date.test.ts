import { describe, expect, test } from 'vitest';
import {
  addDays,
  currentCalendarDateIn,
  daysInMonth,
  formatIsoDate,
  localDateTimeToInstant,
  parseIsoDate,
  walkOccurrences,
  type CalendarDate,
  type WalkRule,
} from './recurrence-date.js';

type WeeklyRule = WalkRule & { byWeekday: number[] };

function occurrenceDates(rule: WalkRule, horizon = '2035-12-31'): string[] {
  return walkOccurrences(rule, { horizon: parseIsoDate(horizon) }).map(formatIsoDate);
}

function localParts(instant: Date, timeZone: string): Record<string, string> {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant).map((part) => [part.type, part.value]));
}

function expectLocalRoundTrip(
  date: CalendarDate,
  hour: number,
  minute: number,
  timeZone: string,
): void {
  const parts = localParts(localDateTimeToInstant(date, hour, minute, timeZone), timeZone);
  expect(parts).toMatchObject({
    year: String(date.year),
    month: String(date.month).padStart(2, '0'),
    day: String(date.day).padStart(2, '0'),
    hour: String(hour).padStart(2, '0'),
    minute: String(minute).padStart(2, '0'),
  });
}

describe('recurrence calendar dates', () => {
  test('parses and formats a valid ISO date', () => {
    expect(parseIsoDate('2026-08-13')).toEqual({ year: 2026, month: 8, day: 13 });
    expect(formatIsoDate({ year: 2026, month: 8, day: 3 })).toBe('2026-08-03');
    expect(() => parseIsoDate('2026-02-30')).toThrow('invalid ISO calendar date');
  });

  test('calculates leap-year month lengths and walks across boundaries', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(addDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({ year: 2027, month: 1, day: 1 });
  });

  test('walks daily rules with interval, count, endsOn, and horizon limits', () => {
    const startsOn = parseIsoDate('2026-08-01');
    expect(walkOccurrences({ freq: 'daily', interval: 1, startsOn, count: 3 }, { horizon: parseIsoDate('2026-12-01') }).map(formatIsoDate))
      .toEqual(['2026-08-01', '2026-08-02', '2026-08-03']);
    expect(walkOccurrences({ freq: 'daily', interval: 3, startsOn, endsOn: parseIsoDate('2026-08-08') }, { horizon: parseIsoDate('2026-12-01') }).map(formatIsoDate))
      .toEqual(['2026-08-01', '2026-08-04', '2026-08-07']);
    expect(walkOccurrences({ freq: 'daily', interval: 1, startsOn }, { horizon: parseIsoDate('2026-08-02') }).map(formatIsoDate))
      .toEqual(['2026-08-01', '2026-08-02']);
  });

  test('converts Asia/Shanghai local wall time to the correct instant', () => {
    expect(localDateTimeToInstant(parseIsoDate('2026-08-13'), 8, 30, 'Asia/Shanghai').toISOString())
      .toBe('2026-08-13T00:30:00.000Z');
  });

  test('walks selected weekdays from the first eligible day on or after startsOn', () => {
    const rule: WeeklyRule = {
      freq: 'weekly',
      interval: 1,
      startsOn: parseIsoDate('2026-08-12'),
      byWeekday: [2, 4, 6],
      count: 6,
    };

    expect(occurrenceDates(rule)).toEqual([
      '2026-08-13',
      '2026-08-15',
      '2026-08-18',
      '2026-08-20',
      '2026-08-22',
      '2026-08-25',
    ]);
  });

  test('applies weekly interval to the containing Sunday-based week', () => {
    const rule: WeeklyRule = {
      freq: 'weekly',
      interval: 2,
      startsOn: parseIsoDate('2026-08-12'),
      byWeekday: [1],
      count: 3,
    };

    expect(occurrenceDates(rule)).toEqual(['2026-08-24', '2026-09-07', '2026-09-21']);
  });

  test('falls back to the startsOn weekday when weekly weekdays are empty', () => {
    const rule: WeeklyRule = {
      freq: 'weekly',
      interval: 1,
      startsOn: parseIsoDate('2026-08-12'),
      byWeekday: [],
      count: 3,
    };

    expect(occurrenceDates(rule)).toEqual(['2026-08-12', '2026-08-19', '2026-08-26']);
  });

  test('clamps a monthly 31st anchor and returns to the original anchor', () => {
    expect(occurrenceDates({
      freq: 'monthly',
      interval: 1,
      startsOn: parseIsoDate('2027-01-31'),
      count: 5,
    })).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
      '2027-05-31',
    ]);

    expect(occurrenceDates({
      freq: 'monthly',
      interval: 1,
      startsOn: parseIsoDate('2028-01-31'),
      count: 3,
    })).toEqual(['2028-01-31', '2028-02-29', '2028-03-31']);
  });

  test.each([
    ['2027-01-29', '2027-02-28', '2027-03-29'],
    ['2027-01-30', '2027-02-28', '2027-03-30'],
    ['2027-01-31', '2027-02-28', '2027-03-31'],
  ])('preserves the original monthly anchor for %s', (startsOn, february, march) => {
    expect(occurrenceDates({
      freq: 'monthly',
      interval: 1,
      startsOn: parseIsoDate(startsOn),
      count: 3,
    })).toEqual([startsOn, february, march]);
  });

  test('clamps a leap-day yearly anchor and restores it in the next leap year', () => {
    expect(occurrenceDates({
      freq: 'yearly',
      interval: 1,
      startsOn: parseIsoDate('2028-02-29'),
      count: 5,
    })).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
    ]);
  });

  test('honors inclusive count, endsOn, and horizon termination', () => {
    const startsOn = parseIsoDate('2026-08-01');
    expect(occurrenceDates({ freq: 'daily', interval: 1, startsOn, count: 3 }))
      .toEqual(['2026-08-01', '2026-08-02', '2026-08-03']);
    expect(occurrenceDates({
      freq: 'weekly',
      interval: 1,
      startsOn,
      endsOn: parseIsoDate('2026-08-15'),
      byWeekday: [6],
    } as WeeklyRule)).toEqual(['2026-08-01', '2026-08-08', '2026-08-15']);
    expect(occurrenceDates({
      freq: 'weekly',
      interval: 1,
      startsOn,
      endsOn: parseIsoDate('2026-08-14'),
      byWeekday: [6],
    } as WeeklyRule)).toEqual(['2026-08-01', '2026-08-08']);
    expect(occurrenceDates({ freq: 'daily', interval: 1, startsOn }, '2026-08-02'))
      .toEqual(['2026-08-01', '2026-08-02']);
  });

  test('round-trips New York wall time after the spring DST transition', () => {
    expect(localDateTimeToInstant(parseIsoDate('2027-03-14'), 9, 30, 'America/New_York').toISOString())
      .toBe('2027-03-14T13:30:00.000Z');
    expectLocalRoundTrip(parseIsoDate('2027-03-14'), 9, 30, 'America/New_York');
  });

  test('round-trips New York wall time after the autumn DST transition', () => {
    expect(localDateTimeToInstant(parseIsoDate('2027-11-07'), 9, 30, 'America/New_York').toISOString())
      .toBe('2027-11-07T14:30:00.000Z');
    expectLocalRoundTrip(parseIsoDate('2027-11-07'), 9, 30, 'America/New_York');
  });

  test('does not drift calendar dates while crossing the New York DST boundary', () => {
    let date = parseIsoDate('2027-03-08');
    const end = parseIsoDate('2027-03-20');
    while (formatIsoDate(date) <= formatIsoDate(end)) {
      expectLocalRoundTrip(date, 0, 0, 'America/New_York');
      date = addDays(date, 1);
    }
  });

  test('round-trips a non-DST Asia/Shanghai date', () => {
    expectLocalRoundTrip(parseIsoDate('2027-06-15'), 9, 30, 'Asia/Shanghai');
  });

  test('shifts a nonexistent spring-forward wall time forward by the gap', () => {
    // 2027-03-14 02:30 does not exist in New York: 02:00 EST jumps to 03:00
    // EDT. RFC 5545 shifts it forward by the gap, so it lands on 03:30 EDT
    // (07:30Z) — never on 01:30 EST (06:30Z), an hour before what was asked.
    const instant = localDateTimeToInstant(parseIsoDate('2027-03-14'), 2, 30, 'America/New_York');
    expect(instant.toISOString()).toBe('2027-03-14T07:30:00.000Z');
    expect(localParts(instant, 'America/New_York')).toMatchObject({ hour: '03', minute: '30' });
  });

  test('resolves an ambiguous fall-back wall time to its first occurrence', () => {
    // 2027-11-07 01:30 happens twice in New York: 01:30 EDT (05:30Z) and then
    // 01:30 EST (06:30Z). The earlier, still-DST one wins.
    const instant = localDateTimeToInstant(parseIsoDate('2027-11-07'), 1, 30, 'America/New_York');
    expect(instant.toISOString()).toBe('2027-11-07T05:30:00.000Z');
    expectLocalRoundTrip(parseIsoDate('2027-11-07'), 1, 30, 'America/New_York');
  });

  test('round-trips a UTC wall time, whose offset Intl renders as a bare "GMT"', () => {
    expect(localDateTimeToInstant(parseIsoDate('2027-03-14'), 2, 30, 'UTC').toISOString())
      .toBe('2027-03-14T02:30:00.000Z');
    expectLocalRoundTrip(parseIsoDate('2027-03-14'), 2, 30, 'UTC');
  });

  test('returns the next calendar date for a UTC+14 zone before the UTC date has rolled over', () => {
    expect(currentCalendarDateIn('Pacific/Kiritimati', new Date('2026-08-12T11:00:00Z')))
      .toEqual({ year: 2026, month: 8, day: 13 });
  });

  test('returns the previous calendar date for a UTC-11 zone after the UTC date has already rolled over', () => {
    expect(currentCalendarDateIn('Pacific/Midway', new Date('2026-08-12T05:00:00Z')))
      .toEqual({ year: 2026, month: 8, day: 11 });
  });

  test('returns the UTC calendar date for the UTC zone itself', () => {
    expect(currentCalendarDateIn('UTC', new Date('2026-08-12T11:00:00Z')))
      .toEqual({ year: 2026, month: 8, day: 12 });
  });

  test('returns the local calendar date across the New York spring DST transition day', () => {
    expect(currentCalendarDateIn('America/New_York', new Date('2026-03-08T12:00:00Z')))
      .toEqual({ year: 2026, month: 3, day: 8 });
  });

  test('throws rather than silently falling back to UTC for an unresolvable time zone', () => {
    expect(() => currentCalendarDateIn('Not/AZone', new Date('2026-08-12T11:00:00Z'))).toThrow();
  });
});
