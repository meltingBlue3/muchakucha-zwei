// Web/TypeScript fallback; Metro selects japanese-calendar.native.ts on devices.
const STORAGE_KEY = 'muchakucha:japanese-calendar';

/** This device's choice to show Japan's holidays and era years, or null before the person has chosen. */
export async function readJapaneseCalendarChoice(): Promise<boolean | null> {
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY);
    return value === 'on' ? true : value === 'off' ? false : null;
  } catch {
    return null;
  }
}

export async function writeJapaneseCalendarChoice(show: boolean): Promise<void> {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, show ? 'on' : 'off');
  } catch {
    // Without storage the choice lasts until the page reloads.
  }
}
