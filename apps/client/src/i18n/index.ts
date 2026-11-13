import { getLocales } from 'expo-localization';
import i18next from 'i18next';
import { useSyncExternalStore } from 'react';
import { initReactI18next } from 'react-i18next';

import { announceLanguage, readLanguageChoice, writeLanguageChoice } from '../platform/preferences/language';
import { ja } from './locales/ja';
import { zh, type Catalog } from './locales/zh';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: Catalog;
  }
}

/** The languages the interface is written in. Chinese is the source and the fallback. */
export const LANGUAGES = ['zh', 'ja'] as const;
export type Language = typeof LANGUAGES[number];
/** What a device is set to: one language, or whatever the system prefers. */
export type LanguageChoice = Language | 'system';

/** Each language under its own name, as someone looking for it reads it. */
export const LANGUAGE_NAMES: Record<Language, string> = { zh: '中文', ja: '日本語' };
const LANGUAGE_TAGS: Record<Language, string> = { zh: 'zh-Hans', ja: 'ja' };

function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language);
}

/** The first language in the system's order that the interface is written in. */
export function systemLanguage(): Language {
  for (const locale of getLocales()) {
    if (isLanguage(locale.languageCode)) return locale.languageCode;
  }
  return 'zh';
}

const stored = readLanguageChoice();
let choice: LanguageChoice = isLanguage(stored) ? stored : 'system';
const listeners = new Set<() => void>();

function languageFor(next: LanguageChoice): Language {
  return next === 'system' ? systemLanguage() : next;
}

export const i18n = i18next.createInstance();
void i18n.use(initReactI18next).init({
  resources: { zh, ja },
  lng: languageFor(choice),
  fallbackLng: 'zh',
  defaultNS: 'common',
  // Catalogs are bundled, so the first render already has its text.
  initAsync: false,
  // React escapes what it renders.
  interpolation: { escapeValue: false },
});
announceLanguage(LANGUAGE_TAGS[languageFor(choice)]);

/** The language the interface is in right now. */
export function currentLanguage(): Language {
  return isLanguage(i18n.language) ? i18n.language : 'zh';
}

/** This device's language setting, for the control that changes it. */
export function useLanguageChoice(): LanguageChoice {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => choice,
    () => choice,
  );
}

/** Switches this device's interface language and remembers the choice. */
export function setLanguageChoice(next: LanguageChoice): void {
  choice = next;
  writeLanguageChoice(next === 'system' ? null : next);
  const language = languageFor(next);
  announceLanguage(LANGUAGE_TAGS[language]);
  void i18n.changeLanguage(language);
  listeners.forEach(listener => listener());
}

/**
 * Text for a component, re-rendering it when the language changes. Take it
 * from here rather than from react-i18next, so the catalogs are loaded first.
 */
export { useTranslation } from 'react-i18next';
