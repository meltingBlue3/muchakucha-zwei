/**
 * The Japanese side of a family calendar: era years (和暦) and the public
 * holidays of the 国民の祝日に関する法律. Pure arithmetic, no I/O.
 *
 * One file on purpose, for the reason `@muchakucha/lunar` gives. That package
 * supplies the Sun's longitude, which fixes 春分の日 and 秋分の日.
 */

import { solarLongitudeTime, type SolarDate } from '@muchakucha/lunar';

const DAY_MS = 86_400_000;

/** Days since 1970-01-01. */
function dayNumber(year: number, month: number, day: number): number {
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

/** 0 for Sunday. Day 0 was a Thursday. */
function weekday(days: number): number {
  return (((days + 4) % 7) + 7) % 7;
}

// ---------------------------------------------------------------------------
// Era years

export interface EraYear {
  /** 明治, 大正, 昭和, 平成 or 令和. */
  era: string;
  /** 1 in the era's first year, which is written 元年. */
  year: number;
}

/**
 * Newest first: the era's name, the first day it names, and the Gregorian
 * year of its 元年. 明治 starts where Japan adopted the Gregorian calendar,
 * on 1873-01-01 in 明治6年; its earlier dates were lunisolar and have no
 * Gregorian day that reads the same.
 */
const ERAS = [
  ['令和', 2019, 5, 1, 2019],
  ['平成', 1989, 1, 8, 1989],
  ['昭和', 1926, 12, 25, 1926],
  ['大正', 1912, 7, 30, 1912],
  ['明治', 1873, 1, 1, 1868],
] as const;

/** The era year a Gregorian date falls in, or null before 1873. */
export function eraYearOf(date: SolarDate): EraYear | null {
  const day = dayNumber(date.year, date.month, date.day);
  for (const [era, year, month, first, firstYear] of ERAS) {
    if (day >= dayNumber(year, month, first)) return { era, year: date.year - firstYear + 1 };
  }
  return null;
}

/** 令和8年, and 令和元年 for a first year. */
export function formatEraYear(date: SolarDate): string | null {
  const value = eraYearOf(date);
  return value === null ? null : `${value.era}${value.year === 1 ? '元' : value.year}年`;
}

// ---------------------------------------------------------------------------
// Public holidays

/** The law took effect on 1948-07-20, so that year has only its autumn holidays. */
export const HOLIDAYS_FIRST_YEAR = 1948;

/** The day of the month a holiday falls on in a year. */
type DayRule = (year: number, month: number) => number;

const on = (day: number): DayRule => () => day;

/** The `nth` Monday, as the ハッピーマンデー amendments moved four holidays. */
const monday = (nth: number): DayRule => (year, month) => {
  const firstWeekday = weekday(dayNumber(year, month, 1));
  return 1 + ((8 - firstWeekday) % 7) + (nth - 1) * 7;
};

/** The day in Japan on which the Sun reaches `longitude`: 0° for 春分, 180° for 秋分. */
const equinox = (longitude: number): DayRule => year =>
  new Date(Math.floor(solarLongitudeTime(year, longitude) + 9 / 24) * DAY_MS).getUTCDate();

const NOW = Number.POSITIVE_INFINITY;

/**
 * Every 国民の祝日 with the years it was observed under that name and rule.
 * A future equinox is the computed one; the government announces each a year
 * ahead from the same astronomy.
 */
const NATIONAL: ReadonlyArray<readonly [name: string, first: number, last: number, month: number, day: DayRule]> = [
  ['元日', 1949, NOW, 1, on(1)],
  ['成人の日', 1949, 1999, 1, on(15)],
  ['成人の日', 2000, NOW, 1, monday(2)],
  ['建国記念の日', 1967, NOW, 2, on(11)],
  ['天皇誕生日', 2020, NOW, 2, on(23)],
  ['春分の日', 1949, NOW, 3, equinox(0)],
  ['天皇誕生日', 1949, 1988, 4, on(29)],
  ['みどりの日', 1989, 2006, 4, on(29)],
  ['昭和の日', 2007, NOW, 4, on(29)],
  ['憲法記念日', 1949, NOW, 5, on(3)],
  ['みどりの日', 2007, NOW, 5, on(4)],
  ['こどもの日', 1949, NOW, 5, on(5)],
  ['海の日', 1996, 2002, 7, on(20)],
  ['海の日', 2003, NOW, 7, monday(3)],
  ['山の日', 2016, NOW, 8, on(11)],
  ['敬老の日', 1966, 2002, 9, on(15)],
  ['敬老の日', 2003, NOW, 9, monday(3)],
  ['秋分の日', 1948, NOW, 9, equinox(180)],
  ['体育の日', 1966, 1999, 10, on(10)],
  ['体育の日', 2000, 2019, 10, monday(2)],
  ['スポーツの日', 2020, NOW, 10, monday(2)],
  ['文化の日', 1948, NOW, 11, on(3)],
  ['勤労感謝の日', 1948, NOW, 11, on(23)],
  ['天皇誕生日', 1989, 2018, 12, on(23)],
];

/** Holidays moved for one year around the Tokyo Olympics, by `year name`. */
const MOVED: Readonly<Partial<Record<string, readonly [month: number, day: number]>>> = {
  '2020 海の日': [7, 23], '2020 スポーツの日': [7, 24], '2020 山の日': [8, 10],
  '2021 海の日': [7, 22], '2021 スポーツの日': [7, 23], '2021 山の日': [8, 8],
};

/** Days that one-off laws made a holiday and treated as a 国民の祝日. */
const ONE_OFF: ReadonlyArray<readonly [year: number, month: number, day: number, name: string]> = [
  [1959, 4, 10, '皇太子明仁親王の結婚の儀'],
  [1989, 2, 24, '昭和天皇の大喪の礼'],
  [1990, 11, 12, '即位礼正殿の儀'],
  [1993, 6, 9, '皇太子徳仁親王の結婚の儀'],
  [2019, 5, 1, '天皇の即位の日'],
  [2019, 10, 22, '即位礼正殿の儀'],
];

/** 振替休日 began with the amendment of 1973-04-12, 国民の休日 with that of 1985-12-27. */
const SUBSTITUTE_FROM = dayNumber(1973, 4, 12);
const CITIZENS_FROM = dayNumber(1985, 12, 27);

const holidayCache = new Map<number, ReadonlyMap<number, string>>();

/** A year's holidays by day number. */
function holidaysByDay(year: number): ReadonlyMap<number, string> {
  const cached = holidayCache.get(year);
  if (cached !== undefined) return cached;
  const days = new Map<number, string>();
  if (Number.isInteger(year) && year >= HOLIDAYS_FIRST_YEAR) {
    for (const [name, first, last, month, rule] of NATIONAL) {
      if (year < first || year > last) continue;
      const [movedMonth, movedDay] = MOVED[`${year} ${name}`] ?? [month, rule(year, month)];
      days.set(dayNumber(year, movedMonth, movedDay), name);
    }
    for (const [oneYear, month, day, name] of ONE_OFF) if (oneYear === year) days.set(dayNumber(year, month, day), name);
    const national = [...days.keys()].sort((a, b) => a - b);
    // A 国民の祝日 on a Sunday gives the next day that is not one. Until 2007
    // the law said the Monday, which was never a 国民の祝日 itself.
    for (const day of national) {
      if (day < SUBSTITUTE_FROM || weekday(day) !== 0) continue;
      let next = day + 1;
      while (days.has(next)) next += 1;
      days.set(next, '振替休日');
    }
    // A day between two 国民の祝日 is a holiday too, unless it already is one;
    // until 2007 a Sunday was left out as well.
    for (const day of national) {
      const between = day + 1;
      if (between < CITIZENS_FROM || days.has(between) || !national.includes(day + 2)) continue;
      if (year < 2007 && weekday(between) === 0) continue;
      days.set(between, '国民の休日');
    }
  }
  holidayCache.set(year, days);
  return days;
}

/** The holiday on a date in Japan, by its Japanese name, or null. */
export function holidayOn(date: SolarDate): string | null {
  return holidaysByDay(date.year).get(dayNumber(date.year, date.month, date.day)) ?? null;
}

/** Short forms that dropping の日 or 日 does not give. */
const SHORT_NAMES: Readonly<Partial<Record<string, string>>> = {
  '国民の休日': '休日',
  '皇太子明仁親王の結婚の儀': '結婚の儀',
  '皇太子徳仁親王の結婚の儀': '結婚の儀',
  '昭和天皇の大喪の礼': '大喪の礼',
  '即位礼正殿の儀': '即位の礼',
  '天皇の即位の日': '即位の日',
};

/** A holiday's name in at most four characters, for a month grid's narrow cells: 建国記念, こども, 休日. */
export function shortHolidayName(name: string): string {
  if (name.length <= 4) return name;
  return SHORT_NAMES[name] ?? name.replace(/の?日$/, '');
}

export interface Holiday extends SolarDate {
  name: string;
}

/** A year's holidays in date order. Empty before 1948. */
export function holidaysOf(year: number): Holiday[] {
  return [...holidaysByDay(year)].sort(([a], [b]) => a - b).map(([day, name]) => {
    const date = new Date(day * DAY_MS);
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), name };
  });
}
