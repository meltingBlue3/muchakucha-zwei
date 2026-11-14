import * as SecureStore from 'expo-secure-store';

// SecureStore keys allow only letters, digits, ".", "-" and "_".
const STORAGE_KEY = 'muchakucha.japaneseCalendar.v1';

/** This device's choice to show Japan's holidays and era years, or null before the person has chosen. */
export async function readJapaneseCalendarChoice(): Promise<boolean | null> {
  try {
    const value = await SecureStore.getItemAsync(STORAGE_KEY);
    return value === 'on' ? true : value === 'off' ? false : null;
  } catch {
    return null;
  }
}

export async function writeJapaneseCalendarChoice(show: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, show ? 'on' : 'off');
  } catch {
    // SecureStore unavailable: the choice lasts until the app restarts.
  }
}
