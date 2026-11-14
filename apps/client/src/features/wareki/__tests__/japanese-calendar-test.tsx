import { act, render } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';

import { setLanguageChoice } from '../../../i18n';
import { MuchakuchaThemeProvider, Text } from '../../../ui/primitives';
import { eraYearOfMonth, holidayLabelOn, holidayNameOn, setJapaneseCalendar, useJapaneseCalendar } from '../japanese-calendar';

jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => [{ languageCode: 'en' }]) }));

function Shown() {
  return <Text>{useJapaneseCalendar() ? 'shown' : 'hidden'}</Text>;
}

afterEach(async () => {
  await act(async () => { setLanguageChoice('system'); });
});

test('holidays follow the interface language until this device chooses, and the choice is remembered', async () => {
  const view = await render(<MuchakuchaThemeProvider><Shown /></MuchakuchaThemeProvider>);
  expect(view.getByText('hidden')).toBeTruthy();
  await act(async () => { setLanguageChoice('ja'); });
  expect(view.getByText('shown')).toBeTruthy();
  await act(async () => { setJapaneseCalendar(false); });
  expect(view.getByText('hidden')).toBeTruthy();
  expect(await SecureStore.getItemAsync('muchakucha.japaneseCalendar.v1')).toBe('off');
  await act(async () => { setLanguageChoice('zh'); setJapaneseCalendar(true); });
  expect(view.getByText('shown')).toBeTruthy();
  expect(await SecureStore.getItemAsync('muchakucha.japaneseCalendar.v1')).toBe('on');
});

test('a date gives its holiday in full and in the short form of a month cell', () => {
  expect(holidayNameOn('2026-11-23')).toBe('勤労感謝の日');
  expect(holidayLabelOn('2026-11-23')).toBe('勤労感謝');
  expect(holidayNameOn('2026-11-24')).toBeNull();
  expect(holidayLabelOn('2026-11-24')).toBeNull();
});

test('a month is headed by the era year of its first day', () => {
  expect(eraYearOfMonth(2026, 10)).toBe('令和8年');
  expect(eraYearOfMonth(2019, 3)).toBe('平成31年');
  expect(eraYearOfMonth(2019, 4)).toBe('令和元年');
});
