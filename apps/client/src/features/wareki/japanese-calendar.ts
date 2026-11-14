import { useSyncExternalStore } from 'react';
import { formatEraYear, holidayOn, shortHolidayName } from '@muchakucha/wareki';

import { useTranslation } from '../../i18n';
import { readJapaneseCalendarChoice, writeJapaneseCalendarChoice } from '../../platform/preferences/japanese-calendar';
import { solarDateOf } from '../lunar/lunar-calendar';

/** Null until the person chooses on this device. */
let choice: boolean | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!hydrated) {
    hydrated = true;
    void readJapaneseCalendarChoice().then(stored => {
      if (stored !== null && stored !== choice) { choice = stored; notify(); }
    });
  }
  return () => { listeners.delete(listener); };
}

/**
 * Whether calendars on this device mark Japan's holidays and name era years.
 * Until the person chooses, a Japanese interface shows them and a Chinese one
 * does not.
 */
export function useJapaneseCalendar(): boolean {
  const { i18n } = useTranslation();
  const chosen = useSyncExternalStore(subscribe, () => choice, () => choice);
  return chosen ?? i18n.language === 'ja';
}

export function setJapaneseCalendar(show: boolean): void {
  hydrated = true;
  choice = show;
  notify();
  void writeJapaneseCalendarChoice(show);
}

/** The holiday on a date by its full Japanese name: 建国記念の日. */
export function holidayNameOn(iso: string): string | null {
  return holidayOn(solarDateOf(iso));
}

/** The holiday in the four characters a month cell has room for: 建国記念. */
export function holidayLabelOn(iso: string): string | null {
  const name = holidayNameOn(iso);
  return name === null ? null : shortHolidayName(name);
}

/** 令和8年 for the month a calendar shows, by its first day. `month` counts from 0. */
export function eraYearOfMonth(year: number, month: number): string | null {
  return formatEraYear({ year, month: month + 1, day: 1 });
}
