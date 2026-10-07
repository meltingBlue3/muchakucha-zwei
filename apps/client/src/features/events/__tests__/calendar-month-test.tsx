import { fireEvent, render } from '@testing-library/react-native';
import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { CalendarMonth } from '../calendar-month';
import { getCalendarMonth } from '../calendar-utils';

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
