import { act, render } from '@testing-library/react-native';
import { getLocales } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';

import { currentLanguage, setLanguageChoice, systemLanguage } from '..';
import { formatDate, formatDateLabel, formatWeekday, weekHeader } from '../../ui/date-values';
import { HouseholdNavigation } from '../../ui/household-navigation';
import { MuchakuchaThemeProvider } from '../../ui/primitives';

jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => [{ languageCode: 'en' }]) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }));

const STORAGE_KEY = 'muchakucha.language.v1';
const mockLocales = getLocales as unknown as jest.Mock<Array<{ languageCode: string }>>;

/** The language a fresh start of the app settles on, given the system's languages and what this device stored. */
function languageAtStart(systemLanguages: string[], storedChoice?: string): string {
  let language = '';
  jest.isolateModules(() => {
    (jest.requireMock('expo-localization') as { getLocales: jest.Mock }).getLocales.mockReturnValue(systemLanguages.map(languageCode => ({ languageCode })));
    if (storedChoice !== undefined) void (jest.requireMock('expo-secure-store') as typeof SecureStore).setItemAsync(STORAGE_KEY, storedChoice);
    language = (require('..') as typeof import('..')).currentLanguage();
  });
  return language;
}

afterEach(async () => {
  mockLocales.mockImplementation(() => [{ languageCode: 'en' }]);
  await act(async () => { setLanguageChoice('system'); });
});

test('the system language is the first one the interface is written in, and Chinese when none is', () => {
  expect(systemLanguage()).toBe('zh');
  mockLocales.mockImplementation(() => [{ languageCode: 'en' }, { languageCode: 'ja' }, { languageCode: 'zh' }]);
  expect(systemLanguage()).toBe('ja');
});

test('a start follows the system until this device has chosen, then keeps the choice', () => {
  expect(languageAtStart(['ja'])).toBe('ja');
  expect(languageAtStart(['en'])).toBe('zh');
  expect(languageAtStart(['zh'], 'ja')).toBe('ja');
  // A stored value the app no longer offers falls back to the system.
  expect(languageAtStart(['ja'], 'fr')).toBe('ja');
});

test('a chosen language is stored on the device, and following the system forgets it', async () => {
  setLanguageChoice('ja');
  expect(await SecureStore.getItemAsync(STORAGE_KEY)).toBe('ja');
  expect(currentLanguage()).toBe('ja');
  setLanguageChoice('system');
  await Promise.resolve();
  expect(await SecureStore.getItemAsync(STORAGE_KEY)).toBeNull();
  expect(currentLanguage()).toBe('zh');
});

test('dates read in the interface language', () => {
  const now = new Date(2030, 5, 15, 12);
  const day = new Date(2030, 5, 20);
  expect(formatDate(day, { weekday: true }, now)).toBe('6月20日周四');
  expect(weekHeader()).toEqual(['一', '二', '三', '四', '五', '六', '日']);
  setLanguageChoice('ja');
  expect(formatDate(day, { weekday: true }, now)).toBe('6月20日(木)');
  expect(formatDate(new Date(2031, 0, 3), {}, now)).toBe('2031年1月3日');
  expect(formatDateLabel('2030-06-20')).toBe('2030年6月20日(木)');
  expect(formatWeekday(day)).toBe('木曜日');
  expect(weekHeader()).toEqual(['月', '火', '水', '木', '金', '土', '日']);
});

test('a screen already on show changes language when the device setting does', async () => {
  const view = await render(<MuchakuchaThemeProvider><HouseholdNavigation householdId="family" active="today" /></MuchakuchaThemeProvider>);
  expect(view.getByRole('tab', { name: '日历' })).toBeTruthy();
  await act(async () => { setLanguageChoice('ja'); });
  expect(view.getByRole('tab', { name: 'カレンダー' })).toBeTruthy();
  expect(view.queryByRole('tab', { name: '日历' })).toBeNull();
  expect(view.getByLabelText('家族のメインナビゲーション')).toBeTruthy();
});
