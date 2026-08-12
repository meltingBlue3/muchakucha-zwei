import { describe, expect, test } from 'vitest';
import { addDays, daysInMonth, formatIsoDate, localDateTimeToInstant, parseIsoDate, walkOccurrences } from './recurrence-date.js';

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
});
