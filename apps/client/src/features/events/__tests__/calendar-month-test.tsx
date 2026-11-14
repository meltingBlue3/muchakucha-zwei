import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { setLanguageChoice } from '../../../i18n';
import { theme } from '../../../ui/theme';
import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { CalendarMonth } from '../calendar-month';
import { getCalendarMonth } from '../calendar-utils';

jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => [{ languageCode: 'en' }]) }));

afterEach(async () => {
  await act(async () => { setLanguageChoice('system'); });
});

describe('weeks start on Monday', () => {
  test.each([
    // January 2025 starts on a Wednesday and ends on a Friday.
    [2025, 0, '2024-12-30', '2025-02-02'],
    // September 2025 starts on a Monday; August 2025 ends on a Sunday.
    [2025, 8, '2025-09-01', '2025-10-05'],
    [2025, 7, '2025-07-28', '2025-08-31'],
  ])('%i-%i runs from %s to %s in whole Monday-to-Sunday weeks', (year, month, first, last) => {
    const { weeks } = getCalendarMonth(year, month);
    expect(weeks.every(row => row.length === 7)).toBe(true);
    expect(weeks.every(row => row[0]!.date.getDay() === 1 && row[6]!.date.getDay() === 0)).toBe(true);
    expect(weeks[0]![0]!.iso).toBe(first);
    expect(weeks.at(-1)![6]!.iso).toBe(last);
  });

  test('the header reads Monday to Sunday', async () => {
    const view = await render(
      <MuchakuchaThemeProvider>
        <CalendarMonth year={2025} month={0} selectedDateIso="2025-01-03" eventsByDate={new Map()} onSelectDate={jest.fn()} onPrevMonth={jest.fn()} onNextMonth={jest.fn()} />
      </MuchakuchaThemeProvider>,
    );
    expect(view.getAllByText(/^[一二三四五六日]$/).map(node => node.props.children)).toEqual(['一', '二', '三', '四', '五', '六', '日']);
  });
});

test('calendar dates have unambiguous names and expose selection independently from today', async () => {
  const onSelectDate = jest.fn();
  const onNextMonth = jest.fn();
  const view = await render(
    <MuchakuchaThemeProvider>
      <CalendarMonth year={2025} month={0} selectedDateIso="2025-01-03" eventsByDate={new Map([['2025-01-03', 2]])} onSelectDate={onSelectDate} onPrevMonth={jest.fn()} onNextMonth={onNextMonth} />
    </MuchakuchaThemeProvider>,
  );
  expect(view.getByRole('button', { name: '2025年1月3日，2个日程' }).props.accessibilityState.selected).toBe(true);
  const adjacentMonth = view.getByRole('button', { name: '2024年12月31日' });
  expect(adjacentMonth.props.accessibilityState.selected).toBe(false);
  await fireEvent.press(adjacentMonth);
  expect(onSelectDate).toHaveBeenCalledWith('2024-12-31');
  await fireEvent.press(view.getByRole('button', { name: '下一个月' }));
  expect(onNextMonth).toHaveBeenCalledTimes(1);
});

test('lunar dates show under the day numbers only when asked for, and keep day names short', async () => {
  const month = (lunar: boolean) => (
    <MuchakuchaThemeProvider>
      <CalendarMonth year={2026} month={10} todayIso="2026-11-11" selectedDateIso="2026-11-11" eventsByDate={new Map()} onSelectDate={jest.fn()} onPrevMonth={jest.fn()} onNextMonth={jest.fn()} lunar={lunar} />
    </MuchakuchaThemeProvider>
  );
  const view = await render(month(true));
  // A plain lunar day, the first of a lunar month by its name, and a solar term.
  for (const text of ['初三', '十月', '立冬', '小雪']) expect(view.getByText(text)).toBeTruthy();
  expect(view.getByRole('button', { name: '2026年11月11日，今天' })).toBeTruthy();
  await view.rerender(month(false));
  expect(view.queryByText('初三')).toBeNull();
});

test('lunar text is written the way the interface language writes it', async () => {
  const view = await render(
    <MuchakuchaThemeProvider>
      <CalendarMonth year={2026} month={8} todayIso="2026-09-16" selectedDateIso="2026-09-16" eventsByDate={new Map()} onSelectDate={jest.fn()} onPrevMonth={jest.fn()} onNextMonth={jest.fn()} lunar />
    </MuchakuchaThemeProvider>,
  );
  for (const text of ['中秋节', '教师节', '八月', '初二', '廿二']) expect(view.getAllByText(text).length).toBeGreaterThan(0);
  await act(async () => { setLanguageChoice('ja'); });
  // 教师节 is China's own day, so a Japanese calendar shows that date's lunar day instead.
  for (const text of ['中秋節', '八月', '二', '二十二', '二十九', '白露']) expect(view.getAllByText(text).length).toBeGreaterThan(0);
  for (const text of ['中秋节', '教师节', '初二', '廿二']) expect(view.queryByText(text)).toBeNull();
});

test('a holiday in Japan is written in vermilion with its name in place of the lunar text, and the era year heads the month', async () => {
  const month = (japanese: boolean) => (
    <MuchakuchaThemeProvider>
      <CalendarMonth year={2026} month={8} todayIso="2026-09-16" selectedDateIso="2026-09-25" eventsByDate={new Map()} onSelectDate={jest.fn()} onPrevMonth={jest.fn()} onNextMonth={jest.fn()} lunar japanese={japanese} />
    </MuchakuchaThemeProvider>
  );
  const color = (text: string) => StyleSheet.flatten(view.getByText(text).props.style).color;
  const view = await render(month(true));
  // 敬老の日, the day it and 秋分の日 enclose, and 秋分の日 over the solar term 秋分; 中秋节 keeps its lunar name.
  for (const text of ['令和8年', '敬老の日', '休日', '秋分の日', '中秋节', '白露']) expect(view.getByText(text)).toBeTruthy();
  expect(view.queryByText('秋分')).toBeNull();
  expect(view.getByRole('button', { name: '2026年9月22日，国民の休日' })).toBeTruthy();
  expect(view.getByRole('button', { name: '2026年9月16日，今天' })).toBeTruthy();
  expect([color('21'), color('敬老の日')]).toEqual([theme.colors.accent, theme.colors.accent]);
  expect(color('14')).toBe(theme.colors.ink);
  // Today is a pale vermilion mark, so its number cannot be taken for a holiday's.
  expect(color('16')).toBe(theme.colors.accentStrong);
  await view.rerender(month(false));
  for (const text of ['令和8年', '敬老の日', '休日']) expect(view.queryByText(text)).toBeNull();
  expect(view.getByText('秋分')).toBeTruthy();
  expect(color('21')).toBe(theme.colors.ink);
  expect(view.getByRole('button', { name: '2026年9月22日' })).toBeTruthy();
});
