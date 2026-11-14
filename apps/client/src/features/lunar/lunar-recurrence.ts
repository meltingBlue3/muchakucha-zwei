import type { LunarAnchorDto } from '@muchakucha/api-client';
import { LUNAR_LAST_YEAR, formatLunarMonthDay, lunarAnniversary, toLunar, type SolarDate } from '@muchakucha/lunar';

import { currentLanguage } from '../../i18n';
import { solarDateOf } from './lunar-calendar';

function isoOf(date: SolarDate | null): string | null {
  return date === null ? null : `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

/**
 * The lunar month and day a yearly rule on `date` repeats on, or null outside
 * the lunar table. A previous anchor that falls on `date` is kept, so a 三十
 * shown on 廿九 in a short month stays 三十.
 */
export function lunarAnchorFor(date: string, previous?: LunarAnchorDto | null): LunarAnchorDto | null {
  const lunar = toLunar(solarDateOf(date));
  if (lunar === null) return null;
  if (previous && isoOf(lunarAnniversary(lunar.year, previous.month, previous.day)) === date) return previous;
  return { month: lunar.month, day: lunar.day };
}

/** 十月十五, in the interface language. */
export function formatLunarAnchor(anchor: LunarAnchorDto): string {
  return formatLunarMonthDay(anchor.month, anchor.day, false, currentLanguage());
}

/** The dates of a lunar yearly rule, every `interval` lunar years from the first on or after `startsOn`. */
export function* lunarOccurrences(startsOn: string, anchor: LunarAnchorDto, interval = 1): Generator<string> {
  const startYear = toLunar(solarDateOf(startsOn))?.year;
  if (startYear === undefined) return;
  const inStartYear = isoOf(lunarAnniversary(startYear, anchor.month, anchor.day));
  for (let year = inStartYear !== null && inStartYear >= startsOn ? startYear : startYear + 1; year <= LUNAR_LAST_YEAR; year += interval) {
    const date = isoOf(lunarAnniversary(year, anchor.month, anchor.day));
    if (date === null) return;
    yield date;
  }
}

/** The first date of a lunar yearly rule on or after `from`. */
export function nextLunarDate(from: string, anchor: LunarAnchorDto): string | null {
  return lunarOccurrences(from, anchor).next().value ?? null;
}
