import { fireEvent, render } from '@testing-library/react-native';
import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { CalendarMonth } from '../calendar-month';

test('calendar dates have unambiguous names and expose selection independently from today', async () => {
  const onSelectDate = jest.fn();
  const onNextMonth = jest.fn();
  const view = await render(
    <MuchakuchaThemeProvider>
      <CalendarMonth year={2025} month={0} selectedDateIso="2025-01-03" eventsByDate={new Map([['2025-01-03', 2]])} onSelectDate={onSelectDate} onPrevMonth={jest.fn()} onNextMonth={onNextMonth} />
    </MuchakuchaThemeProvider>,
  );
  expect(view.getByRole('button', { name: '2025-01-03，2个事件' }).props.accessibilityState.selected).toBe(true);
  const adjacentMonth = view.getByRole('button', { name: '2024-12-31' });
  expect(adjacentMonth.props.accessibilityState.selected).toBe(false);
  await fireEvent.press(adjacentMonth);
  expect(onSelectDate).toHaveBeenCalledWith('2024-12-31');
  await fireEvent.press(view.getByRole('button', { name: '下一个月' }));
  expect(onNextMonth).toHaveBeenCalledTimes(1);
});
