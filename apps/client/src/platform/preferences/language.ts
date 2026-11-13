// Web/TypeScript fallback; Metro selects language.native.ts on devices.
const STORAGE_KEY = 'muchakucha:language';

/**
 * This device's chosen interface language, or null while it follows the system.
 * Read synchronously, so the first render is already in that language.
 */
export function readLanguageChoice(): string | null {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeLanguageChoice(language: string | null): void {
  try {
    if (language === null) globalThis.localStorage?.removeItem(STORAGE_KEY);
    else globalThis.localStorage?.setItem(STORAGE_KEY, language);
  } catch {
    // Without storage the choice lasts until the page reloads.
  }
}

/** Tells the browser the page's language, so it picks that language's glyphs for shared Han characters. */
export function announceLanguage(tag: string): void {
  if (typeof document !== 'undefined') document.documentElement.lang = tag;
}
