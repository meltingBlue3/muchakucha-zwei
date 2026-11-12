import { describe, expect, test } from 'vitest';
import { findLunarDates, lunarCalendar, occurrenceFacts } from './assistant-lunar.js';

const dates = (result: { dates: Array<{ date: string }> }) => result.dates.map(match => match.date);

describe('lunar_calendar', () => {
  test('reads every day of a range with its lunar date, lunar year and observances', () => {
    const { days } = lunarCalendar('2026-11-07', '2026-11-12', false);
    expect(days).toHaveLength(6);
    expect(days[0]).toEqual({ date: '2026-11-07', weekday: '周六', lunar: '农历九月廿九', lunarYear: '丙午马年', observances: ['立冬'] });
    expect(days[2]).toEqual({ date: '2026-11-09', weekday: '周一', lunar: '农历十月初一', lunarYear: '丙午马年' });
    expect(days[5]).toMatchObject({ date: '2026-11-12', lunar: '农历十月初四' });
  });

  test('notable days are only the ones with a festival or solar term', () => {
    expect(lunarCalendar('2027-02-01', '2027-02-10', true).days).toEqual([
      { date: '2027-02-04', weekday: '周四', lunar: '农历腊月廿八', lunarYear: '丙午马年', observances: ['立春'] },
      { date: '2027-02-05', weekday: '周五', lunar: '农历腊月廿九', lunarYear: '丙午马年', observances: ['除夕'] },
      { date: '2027-02-06', weekday: '周六', lunar: '农历正月初一', lunarYear: '丁未羊年', observances: ['春节'] },
    ]);
  });

  test('says so when a range leaves the supported years', () => {
    expect(lunarCalendar('1899-12-30', '1900-01-02', false)).toEqual({ days: [], note: '只能查农历 1900 年到 2100 年。' });
  });
});

describe('find_lunar_dates', () => {
  test('a lunar month and day gives the dates a lunar yearly series has', () => {
    expect(dates(findLunarDates({ month: 10, day: 15, count: 3 }, '2026-11-12'))).toEqual(['2026-11-23', '2027-11-12', '2028-11-30']);
    // On the day itself, that day counts.
    expect(dates(findLunarDates({ month: 10, day: 15 }, '2026-11-23'))).toEqual(['2026-11-23']);
  });

  test('a 三十 falls on 廿九 in a short month, and says so', () => {
    const result = findLunarDates({ month: 12, day: 30, count: 2 }, '2026-11-12');
    expect(result.dates).toEqual([
      { date: '2027-02-05', weekday: '周五', lunar: '农历腊月廿九', lunarYear: '丙午马年', observances: ['除夕'], note: '这一年腊月没有三十，按廿九算。' },
      expect.objectContaining({ date: '2028-01-25', lunar: '农历腊月廿九', note: '这一年腊月没有三十，按廿九算。' }),
    ]);
  });

  test('a lunar year converts one exact date, including a leap month', () => {
    expect(findLunarDates({ month: 12, day: 3, lunarYear: 1968 }, '2026-11-12').dates).toEqual([
      { date: '1969-01-20', weekday: '周一', lunar: '农历腊月初三', lunarYear: '戊申猴年', observances: ['大寒'] },
    ]);
    expect(findLunarDates({ month: 6, day: 8, lunarYear: 2025, leap: true }, '2026-11-12').dates).toEqual([
      expect.objectContaining({ date: '2025-08-01', lunar: '农历闰六月初八' }),
    ]);
    expect(findLunarDates({ month: 5, day: 1, lunarYear: 2025, leap: true }, '2026-11-12')).toEqual({ dates: [], note: '农历 2025 年没有闰五月。' });
    expect(findLunarDates({ month: 12, day: 30, lunarYear: 2026 }, '2026-11-12')).toEqual({ dates: [], note: '农历 2026 年腊月只有 29 天。' });
  });

  test('a festival or solar term is found by name', () => {
    expect(dates(findLunarDates({ name: '中秋节' }, '2026-11-12'))).toEqual(['2027-09-15']);
    expect(dates(findLunarDates({ name: '除夕', count: 2 }, '2026-11-12'))).toEqual(['2027-02-05', '2028-01-25']);
    expect(dates(findLunarDates({ name: '母亲节', count: 2 }, '2026-11-12'))).toEqual(['2027-05-09', '2028-05-14']);
    expect(dates(findLunarDates({ name: '冬至' }, '2026-11-12'))).toEqual(['2026-12-22']);
  });

  test('says so when the supported years run out', () => {
    expect(findLunarDates({ month: 1, day: 1, count: 3 }, '2100-06-01')).toEqual({ dates: [], note: '只能查农历 1900 年到 2100 年。' });
  });
});

describe('occurrence facts', () => {
  const lunarBirthday = { lunar: { month: 10, day: 15 }, occasion: 'birthday', birthYear: 1968 };

  test('a lunar birthday shows its lunar date and an age counted in lunar years', () => {
    expect(occurrenceFacts(lunarBirthday, '2026-11-23')).toEqual({ lunarDate: '农历十月十五', age: 58 });
    // 腊月 of lunar 2026 falls in January 2027, and that birthday is still the 58th.
    expect(occurrenceFacts({ ...lunarBirthday, lunar: { month: 12, day: 3 } }, '2027-01-10')).toEqual({ lunarDate: '农历腊月初三', age: 58 });
  });

  test('a Gregorian birthday counts Gregorian years; other series only name the lunar date', () => {
    expect(occurrenceFacts({ lunar: null, occasion: 'birthday', birthYear: 1990 }, '2026-12-04')).toEqual({ age: 36 });
    expect(occurrenceFacts({ lunar: { month: 7, day: 15 }, occasion: null, birthYear: null }, '2027-08-16')).toEqual({ lunarDate: '农历七月十五' });
    expect(occurrenceFacts({ lunar: null, occasion: null, birthYear: null }, '2026-12-04')).toEqual({});
    expect(occurrenceFacts(lunarBirthday, null)).toEqual({});
    expect(occurrenceFacts(null, '2026-11-23')).toEqual({});
  });
});
