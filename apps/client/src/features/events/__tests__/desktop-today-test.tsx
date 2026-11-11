import type { EventResponseDto, TaskResponseDto } from '@muchakucha/api-client';
import { fireEvent, render, within } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { formatDate } from '../../../ui/date-values';
import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { DesktopToday } from '../desktop-today';

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
