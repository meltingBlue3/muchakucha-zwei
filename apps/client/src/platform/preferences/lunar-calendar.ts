// Web/TypeScript fallback; Metro selects lunar-calendar.native.ts on devices.
const STORAGE_KEY = 'muchakucha:lunar-calendar';

/** This device's choice to show lunar dates, or null before the person has chosen. */
export async function readLunarCalendarChoice(): Promise<boolean | null> {
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY);
    return value === 'on' ? true : value === 'off' ? false : null;
  } catch {
    return null;
  }
}

export async function writeLunarCalendarChoice(show: boolean): Promise<void> {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, show ? 'on' : 'off');
  } catch {
    // Without storage the choice lasts until the page reloads.
  }
}
