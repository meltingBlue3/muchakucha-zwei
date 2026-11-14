import { useSyncExternalStore } from 'react';
import {
  describeLunarDay,
  formatLunarDate,
  lunarDayLabel,
  toLunar,
  type LunarDayLabel,
  type SolarDate,
} from '@muchakucha/lunar';

import { currentLanguage } from '../../i18n';
import { readLunarCalendarChoice, writeLunarCalendarChoice } from '../../platform/preferences/lunar-calendar';

/** Lunar dates show until the person turns them off on this device. */
let showLunar = true;
let hydrated = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!hydrated) {
    hydrated = true;
    void readLunarCalendarChoice().then(choice => {
      if (choice !== null && choice !== showLunar) { showLunar = choice; notify(); }
    });
  }
  return () => { listeners.delete(listener); };
}

/** Whether calendars on this device show lunar dates. */
export function useLunarCalendar(): boolean {
  return useSyncExternalStore(subscribe, () => showLunar, () => showLunar);
}

export function setLunarCalendar(show: boolean): void {
  hydrated = true;
  showLunar = show;
  notify();
  void writeLunarCalendarChoice(show);
}

export function solarDateOf(iso: string): SolarDate {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)), day: Number(iso.slice(8, 10)) };
}

// Names come in the interface language. A component that shows one calls
// `useTranslation`, so it renders again when the language changes.

/** The short text under a date in a month grid. */
export function lunarLabelOn(iso: string): LunarDayLabel | null {
  return lunarDayLabel(solarDateOf(iso), currentLanguage());
}

/** 农历十月初三, then the day's festivals and solar term, for headings and screen readers. */
export function lunarDescriptionOn(iso: string): string | null {
  return describeLunarDay(solarDateOf(iso), currentLanguage());
}

/** 农历十月初三 alone. */
export function lunarDateOn(iso: string): string | null {
  const lunar = toLunar(solarDateOf(iso));
  return lunar === null ? null : formatLunarDate(lunar.month, lunar.day, lunar.leap, currentLanguage());
}
