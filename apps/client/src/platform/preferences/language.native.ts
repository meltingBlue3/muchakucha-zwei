import * as SecureStore from 'expo-secure-store';

// SecureStore keys allow only letters, digits, ".", "-" and "_".
const STORAGE_KEY = 'muchakucha.language.v1';

/**
 * This device's chosen interface language, or null while it follows the system.
 * Read synchronously, so the first render is already in that language.
 */
export function readLanguageChoice(): string | null {
  try {
    return SecureStore.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeLanguageChoice(language: string | null): void {
  // SecureStore unavailable: the choice lasts until the app restarts.
  void (language === null ? SecureStore.deleteItemAsync(STORAGE_KEY) : SecureStore.setItemAsync(STORAGE_KEY, language)).catch(() => undefined);
}

/** Native text takes its glyphs from the system language; there is no page to mark. */
export function announceLanguage(_tag: string): void {}
