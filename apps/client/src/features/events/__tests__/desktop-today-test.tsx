import type { EventResponseDto, TaskResponseDto } from '@muchakucha/api-client';
import { fireEvent, render, within } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { StyleSheet } from 'react-native';
import { formatDate } from '../../../ui/date-values';
import { dayCountTone } from '../../../ui/picker-panels';
import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { theme } from '../../../ui/theme';
import { toCalendarGridRangeIso } from '../calendar-utils';
import { countCalendarItemsByDate, DesktopToday } from '../desktop-today';

const event = (id: string, title: string, startTime: string, endTime: string): EventResponseDto => ({ id, householdId: 'home', title, startTime, endTime, allDay: false, description: null, location: null, labels: [], createdBy: 'user', createdAt: startTime, updatedAt: startTime, recurrenceRuleId: null, recurrence: null, myReminder: { mode: 'default', minutesBefore: null, alarm: null }, cancelledAt: null });

const pickUp: TaskResponseDto = { id: 'parcel', householdId: 'home', title: '取快递', description: null, status: 'pending', priority: 'medium', assigneeIds: [], dueDate: '2026-11-10T12:30:00', recurrenceRuleId: null, occurrenceDate: null, recurrence: null, createdBy: 'user', createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', labels: [], myReminder: { mode: 'default', minutesBefore: null } };

const renderToday = (events: EventResponseDto[], upcomingEvents: EventResponseDto[], props: Partial<ComponentProps<typeof DesktopToday>> = {}) => render(
  <MuchakuchaThemeProvider>
    <DesktopToday detail={null} date="2026-11-10" nowMinutes={10 * 60 + 42} events={events} todayTasks={[]} overdue={[]} unscheduled={[]} upcoming={[]} upcomingEvents={upcomingEvents} renderTask={() => null} taskCompletion={() => ({ onToggleComplete: () => undefined, statusChanging: false, statusError: null })} onOpenEvent={() => undefined} onOpenTask={() => undefined} onSelectDate={() => undefined} onOpenCalendar={() => undefined} onOpenTasks={() => undefined} onCreateTask={() => undefined} {...props} />
  </MuchakuchaThemeProvider>,
);

test('a half-hour event on the timeline puts its time and title on the one line it has room for', async () => {
  // A two-line block of 24px clipped the title away and left only the time visible.
  const view = await renderToday([event('dentist', '牙医复诊', '2026-11-10T09:30:00', '2026-11-10T10:00:00')], []);
  expect(within(view.getByLabelText('日程：牙医复诊')).getByText(/09:30\s+牙医复诊/)).toBeTruthy();
});

test('the coming week is listed by day under date words, and nothing past it appears', async () => {
  const view = await renderToday([], [
    event('swim', '游泳课', '2026-11-24T10:00:00', '2026-11-24T11:00:00'),
    event('meeting', '家长会', '2026-11-12T19:00:00', '2026-11-12T20:30:00'),
  ]);
  expect(view.getByText(`${formatDate(new Date('2026-11-12T12:00:00'))} 周四`)).toBeTruthy();
  expect(view.getByLabelText('接下来日程：家长会')).toBeTruthy();
  expect(view.queryByText(/2026-11-12/)).toBeNull();
  expect(view.queryByLabelText('接下来日程：游泳课')).toBeNull();
});

test('a timed task on the timeline is completed from its ring, a button beside the one that opens it', async () => {
  // The marker's ring was decorative, so a task with a time could only be completed from its detail.
  const onToggleComplete = jest.fn();
  const onOpenTask = jest.fn();
  const view = await renderToday([], [], { todayTasks: [pickUp], onOpenTask, taskCompletion: () => ({ onToggleComplete, statusChanging: false, statusError: null }) });
  const timeline = within(view.getByTestId('today-timeline'));
  const ring = timeline.getByRole('button', { name: '完成任务' });
  const body = timeline.getByRole('button', { name: '任务：取快递' });
  expect(within(body).queryAllByRole('button')).toHaveLength(0);
  expect(within(ring).queryAllByRole('button')).toHaveLength(0);
  await fireEvent.press(ring);
  expect(onToggleComplete).toHaveBeenCalledWith(pickUp);
  expect(onOpenTask).not.toHaveBeenCalled();
  await fireEvent.press(body);
  expect(onOpenTask).toHaveBeenCalledWith(pickUp);
});

test('a completion that failed on the timeline is reported on its marker with a retry', async () => {
  const onRetryStatus = jest.fn();
  const view = await renderToday([], [], { todayTasks: [pickUp], taskCompletion: () => ({ onToggleComplete: () => undefined, statusChanging: false, statusError: '状态没有更新成功，请重试。', onRetryStatus }) });
  const timeline = within(view.getByTestId('today-timeline'));
  expect(timeline.getByText('状态没有更新成功，请重试。')).toBeTruthy();
  await fireEvent.press(timeline.getByRole('button', { name: '重试：取快递' }));
  expect(onRetryStatus).toHaveBeenCalled();
});

test('countCalendarItemsByDate sums spanning events and active dated tasks across the full visible month grid', () => {
  const range = toCalendarGridRangeIso(2026, 10); // November 2026: 2026-10-26 .. 2026-12-06
  expect(range).toEqual({ start: '2026-10-26', end: '2026-12-06' });

  const counts = countCalendarItemsByDate(
    [
      // Multi-day all-day event ending at midnight of Nov 12 covers Nov 9, 10, 11 only.
      { startTime: '2026-11-09T00:00:00', endTime: '2026-11-12T00:00:00', cancelledAt: null },
      // Single-day timed event on Nov 10.
      { startTime: '2026-11-10T10:00:00', endTime: '2026-11-10T11:30:00', cancelledAt: null },
      // Event in visible leading week (Oct 28) and visible trailing week (Dec 3).
      { startTime: '2026-10-28T09:00:00', endTime: '2026-10-28T10:00:00', cancelledAt: null },
      { startTime: '2026-12-03T18:00:00', endTime: '2026-12-03T19:00:00', cancelledAt: null },
      // Cancelled event is excluded.
      { startTime: '2026-11-15T10:00:00', endTime: '2026-11-15T11:00:00', cancelledAt: '2026-11-01T00:00:00Z' },
    ],
    [
      // Overdue pending task on Nov 8.
      { dueDate: '2026-11-08T10:00:00', status: 'pending' },
      // Active task on Nov 10.
      { dueDate: '2026-11-10T12:30:00', status: 'in_progress' },
      // Future task beyond 7 days (Nov 25).
      { dueDate: '2026-11-25T00:00:00', status: 'pending' },
      // Completed, cancelled, and undated tasks are excluded.
      { dueDate: '2026-11-10T15:00:00', status: 'completed' },
      { dueDate: '2026-11-11T15:00:00', status: 'cancelled' },
      { dueDate: null, status: 'pending' },
    ],
    range,
  );

  expect(counts).toEqual({
    '2026-10-28': 1,
    '2026-11-08': 1,
    '2026-11-09': 1,
    '2026-11-10': 3,
    '2026-11-11': 1,
    '2026-11-25': 1,
    '2026-12-03': 1,
  });
});

test('the mini calendar renders color-scaled superscript counts, hides zeros, and notifies on month change', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-10T10:00:00'));
  try {
    const onCalendarMonthChange = jest.fn();
    const view = await renderToday([], [], {
      dayCounts: {
        '2026-11-05': 2,
        '2026-11-10': 0,
        '2026-11-14': 4,
        '2026-11-20': 6,
        '2026-11-28': 9,
        '2026-11-29': 120,
      },
      onCalendarMonthChange,
    });

    // Zero count on today produces no superscript and keeps the plain today label.
    const todayCell = view.getByRole('button', { name: '2026年11月10日，今天' });
    expect(within(todayCell).queryByText('0')).toBeNull();

    // Non-zero days expose count in the accessible name and color the superscript by load tier.
    const cases: Array<{ label: string; badge: string; count: number; color: string }> = [
      { label: '2026年11月5日，2 项安排', badge: '2', count: 2, color: theme.colors.calendarLoadLow },
      { label: '2026年11月14日，4 项安排', badge: '4', count: 4, color: theme.colors.calendarLoadMedium },
      { label: '2026年11月20日，6 项安排', badge: '6', count: 6, color: theme.colors.calendarLoadHigh },
      { label: '2026年11月28日，9 项安排', badge: '9', count: 9, color: theme.colors.calendarLoadHeavy },
      { label: '2026年11月29日，120 项安排', badge: '99+', count: 120, color: theme.colors.calendarLoadHeavy },
    ];
    for (const item of cases) {
      const cell = view.getByRole('button', { name: item.label });
      const sup = within(cell).getByText(item.badge, { includeHiddenElements: true });
      expect(StyleSheet.flatten(sup.props.style).color).toBe(item.color);
      expect(theme.colors[dayCountTone(item.count)]).toBe(item.color);
    }

    await fireEvent.press(view.getByRole('button', { name: '下个月' }));
    expect(onCalendarMonthChange).toHaveBeenCalledWith(2026, 11);
    await fireEvent.press(view.getByRole('button', { name: '上个月' }));
    expect(onCalendarMonthChange).toHaveBeenCalledWith(2026, 10);
  } finally {
    jest.useRealTimers();
  }
});
