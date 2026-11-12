import {
  FESTIVALS, LUNAR_LAST_YEAR, SOLAR_TERMS, formatLunarDay, formatLunarMonth, formatLunarMonthDay, formatLunarYear, fromLunar,
  leapMonthOf, lunarAnniversary, lunarMonthLength, observancesOn, toLunar,
} from '@muchakucha/lunar';
import { addDays, compareDates, formatIsoDate, parseIsoDate, type CalendarDate, type LunarAnchor } from '../recurrence/recurrence-date.js';
import { lunarDateOf, weekdayOf } from './assistant-time.js';

/**
 * Lunar lookups for the assistant. Models get lunar dates wrong, so every lunar
 * date, festival and solar term the assistant states comes from here, computed
 * by the same table the calendar and the recurrence walk use.
 */

/** The names find_lunar_dates accepts: the festivals the calendar marks and the 24 solar terms. */
export const OBSERVANCE_NAMES: readonly string[] = [...FESTIVALS, ...SOLAR_TERMS];

export interface LunarDayRow {
  date: string;
  weekday: string;
  /** 农历冬月初八 */
  lunar: string;
  /** 丙午马年 */
  lunarYear: string;
  observances?: string[];
  note?: string;
}

const UNSUPPORTED = '只能查农历 1900 年到 2100 年。';

function row(date: CalendarDate, note?: string): LunarDayRow | null {
  const lunar = toLunar(date);
  if (lunar === null) return null;
  const iso = formatIsoDate(date);
  const observances = observancesOn(date);
  return {
    date: iso, weekday: weekdayOf(iso), lunar: `农历${formatLunarMonthDay(lunar.month, lunar.day, lunar.leap)}`, lunarYear: formatLunarYear(lunar.year),
    ...(observances.length ? { observances } : {}), ...(note === undefined ? {} : { note }),
  };
}

/** Every day from `start` through `end` inclusive, or only the days with a festival or solar term. */
export function lunarCalendar(start: string, end: string, notableOnly: boolean): { days: LunarDayRow[]; note?: string } {
  const days: LunarDayRow[] = [];
  let unsupported = false;
  const last = parseIsoDate(end);
  for (let date = parseIsoDate(start); compareDates(date, last) <= 0; date = addDays(date, 1)) {
    const day = row(date);
    if (day === null) unsupported = true;
    else if (!notableOnly || day.observances) days.push(day);
  }
  return { days, ...(unsupported ? { note: UNSUPPORTED } : {}) };
}

export interface LunarDateQuery {
  month?: number;
  day?: number;
  leap?: boolean;
  lunarYear?: number;
  name?: string;
  count?: number;
}

export interface LunarDateMatches {
  dates: LunarDayRow[];
  note?: string;
}

/** A festival or solar term comes round within one lunar year, which can run to 385 days. */
const DAYS_PER_OCCURRENCE = 400;

/**
 * Dates on or after `from`. A name finds a festival or solar term. A lunar
 * month and day without a year repeats the way a lunar yearly recurrence does
 * (in the ordinary month, a 三十 on 廿九 when the month is short), so these are
 * the dates a lunar birthday series will have. With `lunarYear` it is one exact
 * date, such as a birth date, and `from` does not apply.
 */
export function findLunarDates(query: LunarDateQuery, from: string): LunarDateMatches {
  const start = parseIsoDate(from);
  const count = query.count ?? 1;
  const dates: LunarDayRow[] = [];
  const short = (matches: LunarDateMatches): LunarDateMatches => dates.length < count ? { ...matches, note: UNSUPPORTED } : matches;

  if (query.name !== undefined) {
    const last = addDays(start, DAYS_PER_OCCURRENCE * count);
    for (let date = start; dates.length < count && compareDates(date, last) <= 0; date = addDays(date, 1)) {
      if (!observancesOn(date).includes(query.name)) continue;
      const day = row(date);
      if (day !== null) dates.push(day);
    }
    return short({ dates });
  }

  const month = query.month ?? 1;
  const day = query.day ?? 1;
  if (query.lunarYear !== undefined) {
    const leap = query.leap === true;
    if (leap && leapMonthOf(query.lunarYear) !== month) {
      return { dates, note: `农历 ${query.lunarYear} 年没有${formatLunarMonth(month, true)}。` };
    }
    const solar = fromLunar({ year: query.lunarYear, month, day, leap });
    const exact = solar === null ? null : row(solar);
    if (exact !== null) return { dates: [exact] };
    const length = lunarMonthLength(query.lunarYear, month, leap);
    return { dates, note: length ? `农历 ${query.lunarYear} 年${formatLunarMonth(month, leap)}只有 ${length} 天。` : UNSUPPORTED };
  }

  const firstYear = toLunar(start)?.year;
  for (let year = firstYear ?? LUNAR_LAST_YEAR + 1; dates.length < count && year <= LUNAR_LAST_YEAR; year += 1) {
    const solar = lunarAnniversary(year, month, day);
    if (solar === null || compareDates(solar, start) < 0) continue;
    const moved = day > lunarMonthLength(year, month);
    const match = row(solar, moved ? `这一年${formatLunarMonth(month)}没有${formatLunarDay(day)}，按${formatLunarDay(lunarMonthLength(year, month))}算。` : undefined);
    if (match !== null) dates.push(match);
  }
  return short({ dates });
}

interface SeriesMarks {
  lunar: LunarAnchor | null;
  occasion: string | null;
  birthYear: number | null;
}

/**
 * What a family reads off one date of a series: its lunar date, for a series
 * that follows the lunar calendar, and the age a birthday marks (周岁, counted
 * in lunar years for a lunar birthday, as the app shows it).
 */
export function occurrenceFacts(marks: SeriesMarks | null | undefined, date: string | null | undefined): { lunarDate?: string; age?: number } {
  if (!marks || !date) return {};
  const lunar = toLunar(parseIsoDate(date));
  const lunarDate = marks.lunar === null ? null : lunarDateOf(date);
  const year = marks.lunar === null ? Number(date.slice(0, 4)) : lunar?.year;
  const age = marks.occasion === 'birthday' && marks.birthYear !== null && year !== undefined && year >= marks.birthYear ? year - marks.birthYear : null;
  return { ...(lunarDate === null ? {} : { lunarDate }), ...(age === null ? {} : { age }) };
}

/** 农历冬月初八: the date a lunar series repeats on, before any short-month move. */
export function formatAnchor(anchor: LunarAnchor): string {
  return `农历${formatLunarMonthDay(anchor.month, anchor.day)}`;
}
