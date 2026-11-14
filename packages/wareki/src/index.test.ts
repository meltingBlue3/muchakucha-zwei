import { describe, expect, it } from 'vitest';

import { eraYearOf, formatEraYear, holidayOn, holidaysOf, HOLIDAYS_FIRST_YEAR, shortHolidayName } from './index.ts';

function date(iso: string) {
  const [year, month, day] = iso.split('-').map(Number);
  return { year: year!, month: month!, day: day! };
}

/** A year's holidays as `M-D name` lines. */
function listed(year: number): string[] {
  return holidaysOf(year).map(holiday => `${holiday.month}-${holiday.day} ${holiday.name}`);
}

describe('era years', () => {
  it('changes era on the day the new one began', () => {
    expect(formatEraYear(date('2019-04-30'))).toBe('平成31年');
    expect(formatEraYear(date('2019-05-01'))).toBe('令和元年');
    expect(formatEraYear(date('1989-01-07'))).toBe('昭和64年');
    expect(formatEraYear(date('1989-01-08'))).toBe('平成元年');
    expect(formatEraYear(date('1926-12-24'))).toBe('大正15年');
    expect(formatEraYear(date('1926-12-25'))).toBe('昭和元年');
    expect(formatEraYear(date('1912-07-29'))).toBe('明治45年');
    expect(formatEraYear(date('1912-07-30'))).toBe('大正元年');
  });

  it('counts years from the era\'s first', () => {
    expect(eraYearOf(date('2026-11-13'))).toEqual({ era: '令和', year: 8 });
    expect(eraYearOf(date('1964-10-10'))).toEqual({ era: '昭和', year: 39 });
    expect(eraYearOf(date('2000-01-01'))).toEqual({ era: '平成', year: 12 });
  });

  it('starts with the Gregorian calendar in 明治6年', () => {
    expect(formatEraYear(date('1873-01-01'))).toBe('明治6年');
    expect(eraYearOf(date('1872-12-31'))).toBeNull();
  });
});

describe('public holidays', () => {
  it('lists a present-day year', () => {
    expect(listed(2026)).toEqual([
      '1-1 元日', '1-12 成人の日', '2-11 建国記念の日', '2-23 天皇誕生日', '3-20 春分の日', '4-29 昭和の日',
      '5-3 憲法記念日', '5-4 みどりの日', '5-5 こどもの日', '5-6 振替休日', '7-20 海の日', '8-11 山の日',
      '9-21 敬老の日', '9-22 国民の休日', '9-23 秋分の日', '10-12 スポーツの日', '11-3 文化の日', '11-23 勤労感謝の日',
    ]);
  });

  it('puts the equinox holidays on the day the equinox falls in Japan', () => {
    const march = [20, 20, 21, 21, 20, 20, 20, 21, 20, 20, 20];
    const september = [22, 23, 23, 23, 22, 23, 23, 23, 22, 23, 23];
    march.forEach((day, index) => expect(holidayOn({ year: 2020 + index, month: 3, day }), `${2020 + index}`).toBe('春分の日'));
    september.forEach((day, index) => expect(holidayOn({ year: 2020 + index, month: 9, day }), `${2020 + index}`).toBe('秋分の日'));
    // 1979's equinox was 3-21 14:22 in Japan; 2012's autumn one fell on 9-22 for the first time since 1896.
    expect(holidayOn(date('1979-03-21'))).toBe('春分の日');
    expect(holidayOn(date('2012-09-22'))).toBe('秋分の日');
  });

  it('agrees with the usual arithmetic for the equinox days of 1980–2099', () => {
    for (let year = 1980; year <= 2099; year += 1) {
      const leapDays = Math.floor((year - 1980) / 4);
      const march = Math.floor(20.8431 + 0.242194 * (year - 1980)) - leapDays;
      const september = Math.floor(23.2488 + 0.242194 * (year - 1980)) - leapDays;
      expect(holidayOn({ year, month: 3, day: march }), `${year}`).toBe('春分の日');
      expect(holidayOn({ year, month: 9, day: september }), `${year}`).toBe('秋分の日');
    }
  });

  it('gives a Sunday holiday the next day that is not a holiday', () => {
    // The first one: 天皇誕生日 fell on Sunday 1973-04-29, after the amendment of 04-12.
    expect(holidayOn(date('1973-04-30'))).toBe('振替休日');
    expect(holidayOn(date('1973-02-12'))).toBeNull();
    // 憲法記念日 on a Sunday: the Monday before 2007, and past the two holidays after it since.
    expect(holidayOn(date('1998-05-04'))).toBe('振替休日');
    expect(listed(2015).filter(line => line.startsWith('5-'))).toEqual(['5-3 憲法記念日', '5-4 みどりの日', '5-5 こどもの日', '5-6 振替休日']);
    expect(holidayOn(date('2023-01-02'))).toBe('振替休日');
  });

  it('makes a day between two holidays a holiday', () => {
    // 5-4 from 1988 until it became みどりの日, except on a Sunday or as a 振替休日.
    expect(holidayOn(date('1988-05-04'))).toBe('国民の休日');
    expect(holidayOn(date('1986-05-04'))).toBeNull();
    expect(holidayOn(date('1987-05-04'))).toBe('振替休日');
    expect(holidayOn(date('1985-05-04'))).toBeNull();
    expect(holidayOn(date('2007-05-04'))).toBe('みどりの日');
    // 敬老の日 on Monday and 秋分の日 on Wednesday.
    expect(holidayOn(date('2009-09-22'))).toBe('国民の休日');
    expect(holidayOn(date('2015-09-22'))).toBe('国民の休日');
    expect(holidayOn(date('2032-09-21'))).toBe('国民の休日');
  });

  it('follows the names and dates of their time', () => {
    expect(holidayOn(date('1999-01-15'))).toBe('成人の日');
    expect(holidayOn(date('2000-01-10'))).toBe('成人の日');
    expect(holidayOn(date('2000-01-15'))).toBeNull();
    expect(holidayOn(date('1988-04-29'))).toBe('天皇誕生日');
    expect(holidayOn(date('1989-04-29'))).toBe('みどりの日');
    expect(holidayOn(date('2007-04-29'))).toBe('昭和の日');
    expect(holidayOn(date('2018-12-23'))).toBe('天皇誕生日');
    expect(listed(2019).filter(line => line.endsWith('天皇誕生日'))).toEqual([]);
    expect(holidayOn(date('2020-02-23'))).toBe('天皇誕生日');
    expect(holidayOn(date('1966-02-11'))).toBeNull();
    expect(holidayOn(date('1967-02-11'))).toBe('建国記念の日');
    expect(holidayOn(date('1999-10-10'))).toBe('体育の日');
    expect(holidayOn(date('2019-10-14'))).toBe('体育の日');
    expect(holidayOn(date('2022-10-10'))).toBe('スポーツの日');
    expect(holidayOn(date('2015-08-11'))).toBeNull();
    expect(holidayOn(date('2016-08-11'))).toBe('山の日');
  });

  it('moves three holidays around the Tokyo Olympics', () => {
    expect(listed(2020).filter(line => /^[78]-/.test(line))).toEqual(['7-23 海の日', '7-24 スポーツの日', '8-10 山の日']);
    expect(listed(2021).filter(line => /^[78]-/.test(line))).toEqual(['7-22 海の日', '7-23 スポーツの日', '8-8 山の日', '8-9 振替休日']);
    expect(holidayOn(date('2021-10-11'))).toBeNull();
  });

  it('keeps the one-off holidays, and the days they enclosed in 2019', () => {
    expect(holidayOn(date('1959-04-10'))).toBe('皇太子明仁親王の結婚の儀');
    expect(holidayOn(date('1990-11-12'))).toBe('即位礼正殿の儀');
    expect(listed(2019).filter(line => /^(4|5)-/.test(line))).toEqual([
      '4-29 昭和の日', '4-30 国民の休日', '5-1 天皇の即位の日', '5-2 国民の休日',
      '5-3 憲法記念日', '5-4 みどりの日', '5-5 こどもの日', '5-6 振替休日',
    ]);
    expect(holidayOn(date('2019-10-22'))).toBe('即位礼正殿の儀');
  });

  it('shortens every name to fit a month cell', () => {
    expect(['元日', '振替休日', '建国記念の日', '天皇誕生日', 'こどもの日', 'スポーツの日', '国民の休日'].map(shortHolidayName))
      .toEqual(['元日', '振替休日', '建国記念', '天皇誕生', 'こども', 'スポーツ', '休日']);
    for (let year = HOLIDAYS_FIRST_YEAR; year <= 2100; year += 1) {
      for (const holiday of holidaysOf(year)) expect(shortHolidayName(holiday.name).length, holiday.name).toBeLessThanOrEqual(4);
    }
  });

  it('starts with the law, in the summer of 1948', () => {
    expect(HOLIDAYS_FIRST_YEAR).toBe(1948);
    expect(listed(1948)).toEqual(['9-23 秋分の日', '11-3 文化の日', '11-23 勤労感謝の日']);
    expect(holidaysOf(1947)).toEqual([]);
    expect(listed(1949)).toEqual([
      '1-1 元日', '1-15 成人の日', '3-21 春分の日', '4-29 天皇誕生日', '5-3 憲法記念日', '5-5 こどもの日',
      '9-23 秋分の日', '11-3 文化の日', '11-23 勤労感謝の日',
    ]);
  });
});
