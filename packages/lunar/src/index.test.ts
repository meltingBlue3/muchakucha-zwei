import { describe, expect, it } from 'vitest';

import {
  FESTIVALS,
  LUNAR_FIRST_YEAR,
  LUNAR_LAST_YEAR,
  SOLAR_TERMS,
  describeLunarDay,
  formatLunarDate,
  formatLunarDay,
  formatLunarMonthDay,
  formatLunarYear,
  fromLunar,
  leapMonthOf,
  lunarAnniversary,
  lunarDayLabel,
  lunarMonthLength,
  observancesOn,
  solarTermOn,
  toLunar,
  type SolarDate,
} from './index.ts';

const DAY_MS = 86_400_000;

function solar(iso: string): SolarDate {
  const [year, month, day] = iso.split('-').map(Number);
  return { year: year!, month: month!, day: day! };
}

function solarAt(ms: number): SolarDate {
  const date = new Date(ms);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/** Node ships full ICU, whose chinese calendar is the independent reference. */
const icu = new Intl.DateTimeFormat('en-u-ca-chinese', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' });

function icuLunar(ms: number) {
  const parts = Object.fromEntries(icu.formatToParts(new Date(ms)).map(part => [part.type, part.value]));
  const month = parts.month ?? '';
  return { year: Number(parts.relatedYear), month: Number(month.replace('bis', '')), day: Number(parts.day), leap: month.endsWith('bis') };
}

const FIRST_DAY = Date.UTC(1900, 0, 31); // 1900 正月初一
const LAST_DAY = Date.UTC(2101, 0, 28); // 2100 腊月廿九

/**
 * Lunar years where ICU's coarser astronomy puts a new moon or a principal
 * term on the wrong side of midnight. Each is listed with what decides it.
 */
const ICU_DIFFERS = new Map<number, string>([
  [1906, 'new moon 1906-04-23 23:52 Beijing local mean time'],
  [1917, '谷雨 on 1917-04-21, so the leap month is 闰二月'],
  [1922, '大暑 on 1922-07-24, so the leap month is 闰五月'],
  [1953, 'new moon 1954-02-03 23:55, so 1953 ends a day earlier'],
  [1954, '春节 1954-02-03'],
  [1955, 'new moon 1955-02-22 23:54'],
  [1987, '处暑 on 1987-08-24 00:09, so the leap month is 闰六月'],
  [1998, 'new moon 1999-01-17 23:46'],
  [2012, 'new moon 2012-08-17 23:54, so 七夕 is 2012-08-23'],
  [2018, 'new moon 2018-11-08 00:02'],
  [2026, 'new moon 2027-02-06 23:56, so 2026 ends a day earlier'],
  [2027, '春节 2027-02-06'],
  [2029, 'new moon 2030-02-03 00:07, so 2029 ends a day later'],
  [2030, '春节 2030-02-03'],
  [2057, 'new moon 2057-09-28 23:59, closer to midnight than any table can settle'],
  [2070, 'new moon 2070-03-12 23:51'],
]);

describe('lunar dates', () => {
  it('agrees with ICU on every day except the listed years, and converts back', () => {
    const differing = new Set<number>();
    const roundTrips: string[] = [];
    for (let ms = FIRST_DAY; ms <= LAST_DAY; ms += DAY_MS) {
      const date = solarAt(ms);
      const actual = toLunar(date);
      const expected = icuLunar(ms);
      if (actual === null) { roundTrips.push(`no lunar date for ${new Date(ms).toISOString().slice(0, 10)}`); continue; }
      if (JSON.stringify(actual) !== JSON.stringify(expected)) differing.add(actual.year).add(expected.year);
      if (JSON.stringify(fromLunar(actual)) !== JSON.stringify(date)) roundTrips.push(new Date(ms).toISOString().slice(0, 10));
    }
    expect(roundTrips).toEqual([]);
    expect([...differing].sort()).toEqual([...ICU_DIFFERS.keys()]);
  });

  it('keeps the published dates where ICU differs', () => {
    expect(toLunar(solar('2027-02-06'))).toEqual({ year: 2027, month: 1, day: 1, leap: false });
    expect(toLunar(solar('2030-02-03'))).toEqual({ year: 2030, month: 1, day: 1, leap: false });
    expect(toLunar(solar('1954-02-03'))).toEqual({ year: 1954, month: 1, day: 1, leap: false });
    expect(toLunar(solar('2012-08-23'))).toEqual({ year: 2012, month: 7, day: 7, leap: false });
    expect([leapMonthOf(1917), leapMonthOf(1922), leapMonthOf(1987)]).toEqual([2, 5, 6]);
  });

  it('has no lunar date outside the supported years', () => {
    expect(toLunar(solar('1900-01-30'))).toBeNull();
    expect(toLunar(solar('2101-01-29'))).toBeNull();
    expect(fromLunar({ year: LUNAR_FIRST_YEAR - 1, month: 1, day: 1, leap: false })).toBeNull();
    expect(lunarAnniversary(LUNAR_LAST_YEAR + 1, 1, 1)).toBeNull();
  });

  it('rejects lunar days that do not exist', () => {
    expect(lunarMonthLength(2026, 9)).toBe(30);
    expect(lunarMonthLength(2026, 10)).toBe(30);
    expect(fromLunar({ year: 2026, month: 6, day: 1, leap: true })).toBeNull();
    expect(leapMonthOf(2025)).toBe(6);
    expect(fromLunar({ year: 2025, month: 6, day: 1, leap: true })).toEqual(solar('2025-07-25'));
    const shortMonth = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].find(month => lunarMonthLength(2026, month) === 29)!;
    expect(fromLunar({ year: 2026, month: shortMonth, day: 30, leap: false })).toBeNull();
  });
});

describe('lunarAnniversary', () => {
  it('finds a lunar birthday in a given lunar year', () => {
    expect(lunarAnniversary(2026, 10, 15)).toEqual(solar('2026-11-23'));
    expect(lunarAnniversary(2026, 11, 8)).toEqual(solar('2026-12-16'));
    expect(lunarAnniversary(2027, 1, 13)).toEqual(solar('2027-02-18'));
    expect(fromLunar({ year: 1987, month: 7, day: 9, leap: false })).toEqual(solar('1987-09-01'));
    expect(lunarAnniversary(1968, 10, 15)).toEqual(solar('1968-12-04'));
  });

  it('moves 三十 to 廿九 in a year whose month is short', () => {
    const shortMonth = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].find(month => lunarMonthLength(2026, month) === 29)!;
    const lastDay = fromLunar({ year: 2026, month: shortMonth, day: 29, leap: false });
    expect(lunarAnniversary(2026, shortMonth, 30)).toEqual(lastDay);
  });

  it('keeps someone born in a leap month in the ordinary month', () => {
    expect(lunarAnniversary(2025, 6, 1)).toEqual(fromLunar({ year: 2025, month: 6, day: 1, leap: false }));
  });
});

describe('solar terms', () => {
  it('falls on the published dates of 2026', () => {
    const published = [
      '01-05', '01-20', '02-04', '02-18', '03-05', '03-20', '04-05', '04-20', '05-05', '05-21', '06-05', '06-21',
      '07-07', '07-23', '08-07', '08-23', '09-07', '09-23', '10-08', '10-23', '11-07', '11-22', '12-07', '12-22',
    ];
    expect(published.map(day => solarTermOn(solar(`2026-${day}`)))).toEqual([...SOLAR_TERMS]);
  });

  it('keeps the years that simple date formulas get wrong', () => {
    expect(solarTermOn(solar('2019-01-05'))).toBe('小寒');
    expect(solarTermOn(solar('2008-05-21'))).toBe('小满');
    expect(solarTermOn(solar('2021-12-21'))).toBe('冬至');
    expect(solarTermOn(solar('2025-02-03'))).toBe('立春');
  });

  it('agrees with the lunar months: 冬至 in 冬月 and no principal term in a leap month', () => {
    // A leap month is one without a principal term (中气), and 冬月 is the
    // month holding 冬至, so ICU's months test the terms where they matter
    // most: close to a new moon.
    const principal = new Set(SOLAR_TERMS.filter((_, index) => index % 2 === 1));
    const problems: string[] = [];
    let current: { month: number; leap: boolean; terms: string[] } | null = null;
    const check = () => {
      if (current === null) return;
      if (current.leap && current.terms.some(term => principal.has(term as (typeof SOLAR_TERMS)[number]))) problems.push(`leap ${current.month}: ${current.terms.join(',')}`);
      if (!current.leap && current.month === 11 && !current.terms.includes('冬至')) problems.push(`冬月 without 冬至: ${current.terms.join(',')}`);
    };
    for (let ms = FIRST_DAY; ms <= LAST_DAY; ms += DAY_MS) {
      const date = solarAt(ms);
      const lunar = toLunar(date)!;
      if (lunar.day === 1) { check(); current = { month: lunar.month, leap: lunar.leap, terms: [] }; }
      const term = solarTermOn(date);
      if (term !== null && current !== null) current.terms.push(term);
    }
    check();
    expect(problems).toEqual([]);
  });

  it('finds exactly 24 terms in every year', () => {
    for (let year = LUNAR_FIRST_YEAR; year <= LUNAR_LAST_YEAR; year += 1) {
      let count = 0;
      for (let ms = Date.UTC(year, 0, 1); ms < Date.UTC(year + 1, 0, 1); ms += DAY_MS) if (solarTermOn(solarAt(ms)) !== null) count += 1;
      expect(count, String(year)).toBe(24);
    }
  });
});

describe('labels', () => {
  it('names lunar months, days and years', () => {
    expect(formatLunarMonthDay(10, 15)).toBe('十月十五');
    expect(formatLunarMonthDay(11, 8)).toBe('冬月初八');
    expect(formatLunarMonthDay(12, 30)).toBe('腊月三十');
    expect(formatLunarMonthDay(4, 1, true)).toBe('闰四月初一');
    expect([1, 10, 11, 20, 21, 29, 30].map(day => formatLunarDay(day))).toEqual(['初一', '初十', '十一', '二十', '廿一', '廿九', '三十']);
    expect(formatLunarYear(2026)).toBe('丙午马年');
    expect(formatLunarYear(1968)).toBe('戊申猴年');
  });

  it('shows a festival, then a solar term, then the month on its first day, then the day', () => {
    expect(lunarDayLabel(solar('2027-02-06'))).toEqual({ text: '春节', kind: 'festival' });
    expect(lunarDayLabel(solar('2027-02-05'))).toEqual({ text: '除夕', kind: 'festival' });
    expect(lunarDayLabel(solar('2026-06-21'))).toEqual({ text: '父亲节', kind: 'festival' });
    expect(lunarDayLabel(solar('2026-05-10'))).toEqual({ text: '母亲节', kind: 'festival' });
    expect(lunarDayLabel(solar('2026-10-01'))).toEqual({ text: '国庆节', kind: 'festival' });
    expect(lunarDayLabel(solar('2026-11-07'))).toEqual({ text: '立冬', kind: 'term' });
    expect(lunarDayLabel(solar('2026-11-09'))).toEqual({ text: '十月', kind: 'month' });
    expect(lunarDayLabel(solar('2025-07-25'))).toEqual({ text: '闰六月', kind: 'month' });
    expect(lunarDayLabel(solar('2026-11-11'))).toEqual({ text: '初三', kind: 'day' });
  });

  it('lists every festival a year observes, and nothing else', () => {
    const seen = new Set<string>();
    for (let ms = Date.UTC(2026, 0, 1); ms < Date.UTC(2027, 0, 1); ms += DAY_MS) {
      for (const name of observancesOn(solarAt(ms))) seen.add(name);
    }
    expect([...seen].sort()).toEqual([...FESTIVALS, ...SOLAR_TERMS].sort());
  });

  it('spells out a day for screen readers with everything it observes', () => {
    expect(describeLunarDay(solar('2026-11-11'))).toBe('农历十月初三');
    expect(describeLunarDay(solar('2026-06-21'))).toBe('农历五月初七，父亲节，夏至');
    expect(describeLunarDay(solar('1800-01-01'))).toBeNull();
  });
});

describe('Japanese names', () => {
  it('writes months and days in numerals a Japanese reader counts', () => {
    expect(formatLunarMonthDay(10, 15, false, 'ja')).toBe('十月十五日');
    expect(formatLunarMonthDay(11, 8, false, 'ja')).toBe('十一月八日');
    expect(formatLunarMonthDay(1, 1, false, 'ja')).toBe('一月一日');
    expect(formatLunarMonthDay(4, 1, true, 'ja')).toBe('閏四月一日');
    expect([1, 10, 11, 20, 21, 29, 30].map(day => formatLunarDay(day, 'ja'))).toEqual(['一日', '十日', '十一日', '二十日', '二十一日', '二十九日', '三十日']);
    expect(formatLunarDate(8, 15, false, 'ja')).toBe('旧暦八月十五日');
    expect(formatLunarDate(8, 15)).toBe('农历八月十五');
  });

  it('labels a month cell in at most three characters', () => {
    expect(lunarDayLabel(solar('2027-02-06'), 'ja')).toEqual({ text: '春節', kind: 'festival' });
    expect(lunarDayLabel(solar('2026-09-25'), 'ja')).toEqual({ text: '中秋節', kind: 'festival' });
    expect(lunarDayLabel(solar('2026-06-21'), 'ja')).toEqual({ text: '父の日', kind: 'festival' });
    expect(lunarDayLabel(solar('2026-03-05'), 'ja')).toEqual({ text: '啓蟄', kind: 'term' });
    expect(lunarDayLabel(solar('2026-11-09'), 'ja')).toEqual({ text: '十月', kind: 'month' });
    expect(lunarDayLabel(solar('2025-07-25'), 'ja')).toEqual({ text: '閏六月', kind: 'month' });
    expect(lunarDayLabel(solar('2026-11-11'), 'ja')).toEqual({ text: '三', kind: 'day' });
    for (let ms = Date.UTC(2026, 0, 1); ms < Date.UTC(2028, 0, 1); ms += DAY_MS) {
      expect(lunarDayLabel(solarAt(ms), 'ja')!.text.length).toBeLessThanOrEqual(3);
    }
  });

  it('leaves out China\'s civic days and falls through to what else the day is', () => {
    // 国庆节 is an ordinary lunar day, and 劳动节 in 2026 is none of the others either.
    expect(lunarDayLabel(solar('2026-10-01'), 'ja')).toEqual({ text: '二十一', kind: 'day' });
    expect(observancesOn(solar('2026-10-01'), 'ja')).toEqual([]);
    expect(observancesOn(solar('2026-10-01'))).toEqual(['国庆节']);
  });

  it('names every solar term and every festival but the civic ones', () => {
    const seen = new Set<string>();
    for (let ms = Date.UTC(2026, 0, 1); ms < Date.UTC(2027, 0, 1); ms += DAY_MS) {
      for (const name of observancesOn(solarAt(ms), 'ja')) seen.add(name);
    }
    expect(seen.size).toBe(SOLAR_TERMS.length + 12);
    for (const name of ['啓蟄', '穀雨', '小満', '芒種', '処暑', '旧七夕', '臘八節', '母の日']) expect(seen.has(name), name).toBe(true);
  });

  it('spells out a day with a Japanese comma', () => {
    expect(describeLunarDay(solar('2026-11-11'), 'ja')).toBe('旧暦十月三日');
    expect(describeLunarDay(solar('2026-06-21'), 'ja')).toBe('旧暦五月七日、父の日、夏至');
  });
});
