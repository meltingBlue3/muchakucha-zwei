import type { EventResponseDto, TaskResponseDto } from '@muchakucha/api-client';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { EventForm } from '../../events/event-form';
import { TaskForm } from '../../tasks/task-form';
import { MuchakuchaThemeProvider } from '../../../ui/primitives';

jest.mock('../../../ui/date-field', () => ({
  DateField: ({ accessibilityLabel, onChange, value }: { accessibilityLabel?: string; onChange(value: string): void; value: string }) => {
    const { TextInput } = require('react-native') as typeof import('react-native');
    return <TextInput accessibilityLabel={accessibilityLabel} onChangeText={onChange} value={value} />;
  },
}));
jest.mock('../../auth/use-current-user', () => ({ useCurrentUser: () => ({ id: 'me', username: 'me', displayName: '我', hasHousehold: true }) }));
jest.mock('../reminder-settings', () => ({
  useReminderSettings: () => ({
    settings: { taskMinutesBefore: 0, eventMinutesBefore: 15, dateOnlyTime: '09:00', households: [] },
    status: 'ready', reload: jest.fn(), save: jest.fn(),
  }),
}));

const members = [{ userId: 'me', displayName: '我' }, { userId: 'mom', displayName: '妈妈' }];

function savedTask(overrides: Partial<TaskResponseDto> = {}): TaskResponseDto {
  const dueDate = new Date('2030-10-01T18:00:00').toISOString();
  return {
    id: 't', householdId: 'h', title: '交水费', description: null, status: 'pending', priority: 'medium', assigneeIds: [],
    dueDate, recurrenceRuleId: null, occurrenceDate: null, recurrence: null, createdBy: 'me', createdAt: dueDate, updatedAt: dueDate,
    labels: [], myReminder: { mode: 'default', minutesBefore: null },
    ...overrides,
  };
}

async function renderTaskForm(initial?: TaskResponseDto) {
  const onSubmit = jest.fn().mockResolvedValue(undefined);
  const view = await render(
    <MuchakuchaThemeProvider>
      <TaskForm {...(initial ? { initial } : {})} isSubmitting={false} members={members} onCancel={jest.fn()} onSubmit={onSubmit} submitLabel={initial ? '保存' : '创建'} />
    </MuchakuchaThemeProvider>,
  );
  return { onSubmit, view };
}

describe('提醒我 in the task form', () => {
  test('appears once the task has a date, and a new task follows the defaults without sending a choice', async () => {
    const { onSubmit, view } = await renderTaskForm();
    expect(view.queryByRole('button', { name: /^提醒我/ })).toBeNull();
    await fireEvent.changeText(view.getByLabelText('任务标题'), '交水费');
    await fireEvent.changeText(view.getByLabelText('截止日期'), '2030-10-01');
    await fireEvent.changeText(view.getByLabelText('截止时间'), '18:00');
    expect(view.getByRole('button', { name: '提醒我，准时提醒（默认）' })).toBeTruthy();
    await fireEvent.press(view.getByLabelText('创建'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('myReminder');
  });

  test('a choice is the person\'s own and goes with the new task', async () => {
    const { onSubmit, view } = await renderTaskForm();
    await fireEvent.changeText(view.getByLabelText('任务标题'), '交水费');
    await fireEvent.changeText(view.getByLabelText('截止日期'), '2030-10-01');
    await fireEvent.changeText(view.getByLabelText('截止时间'), '18:00');
    await fireEvent.press(view.getByRole('button', { name: '提醒我，准时提醒（默认）' }));
    expect(view.getByText('只改你自己的提醒，家人不受影响。')).toBeTruthy();
    await fireEvent.press(view.getByRole('radio', { name: '提前 30 分钟' }));
    expect(view.getByRole('button', { name: '提醒我，提前 30 分钟提醒' })).toBeTruthy();
    await fireEvent.press(view.getByLabelText('创建'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].myReminder).toEqual({ mode: 'before', minutesBefore: 30 });
  });

  test('without a time it offers the day and the day before at the date-only time, and drops a choice that no longer fits', async () => {
    const { onSubmit, view } = await renderTaskForm(savedTask({ myReminder: { mode: 'before', minutesBefore: 30 } }));
    expect(view.getByRole('button', { name: '提醒我，提前 30 分钟提醒' })).toBeTruthy();
    await fireEvent.press(view.getByLabelText('清除截止日期'));
    await fireEvent.changeText(view.getByLabelText('截止日期'), '2030-10-01');
    expect(view.getByRole('button', { name: '提醒我，当天 09:00 提醒（默认）' })).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: '提醒我，当天 09:00 提醒（默认）' }));
    expect(view.getAllByRole('radio').map(option => option.props.accessibilityLabel)).toEqual(['默认（当天 09:00）', '不提醒', '当天 09:00', '前一天 09:00']);
    await fireEvent.press(view.getByRole('radio', { name: '前一天 09:00' }));
    await fireEvent.press(view.getByLabelText('保存'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].myReminder).toEqual({ mode: 'before', minutesBefore: 1440 });
  });

  test('a task without a date leaves the stored reminder alone', async () => {
    const { onSubmit, view } = await renderTaskForm(savedTask({ dueDate: null, myReminder: { mode: 'before', minutesBefore: 60 } }));
    expect(view.queryByRole('button', { name: /^提醒我/ })).toBeNull();
    await fireEvent.changeText(view.getByLabelText('任务标题'), '交电费');
    await fireEvent.press(view.getByLabelText('保存'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('myReminder');
  });

  test('someone else\'s task does not remind this person by default', async () => {
    const { view } = await renderTaskForm(savedTask({ assigneeIds: ['mom'], createdBy: 'mom' }));
    expect(view.getByRole('button', { name: '提醒我，不提醒（默认）' })).toBeTruthy();
  });

  test('an edit of the reminder alone says nothing shared changed', async () => {
    const { onSubmit, view } = await renderTaskForm(savedTask());
    await fireEvent.press(view.getByRole('button', { name: '提醒我，准时提醒（默认）' }));
    await fireEvent.press(view.getByRole('radio', { name: '不提醒' }));
    await fireEvent.press(view.getByLabelText('保存'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].myReminder).toEqual({ mode: 'off', minutesBefore: null });
    expect(onSubmit.mock.calls[0][1]).toEqual({ contentChanged: false });
  });

  test('an edit of the shared content says so and keeps the saved reminder', async () => {
    const { onSubmit, view } = await renderTaskForm(savedTask());
    await fireEvent.changeText(view.getByLabelText('任务标题'), '交电费');
    await fireEvent.press(view.getByLabelText('保存'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][1]).toEqual({ contentChanged: true });
    expect(onSubmit.mock.calls[0][0].myReminder).toEqual({ mode: 'default', minutesBefore: null });
  });

  test('on a recurring task it says the choice covers every occurrence', async () => {
    const { view } = await renderTaskForm(savedTask({
      recurrenceRuleId: 'rule', occurrenceDate: '2030-10-01',
      recurrence: { id: 'rule', freq: 'daily', interval: 1, byWeekday: [], startsOn: '2030-10-01', endsOn: null, count: null, timezone: 'Asia/Shanghai', materializedThrough: null, startTimeLocal: '18:00', durationMinutes: null, updatedAt: '2030-10-01T00:00:00.000Z' },
    }));
    await fireEvent.press(view.getByRole('button', { name: '提醒我，准时提醒（默认）' }));
    expect(view.getByText('只改你自己的提醒，家人不受影响。对这个重复安排的每一次都生效。')).toBeTruthy();
  });
});

describe('提醒我 in the event form', () => {
  test('counts back from the start, and an all-day event uses the date-only time', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const start = new Date('2030-10-01T15:30:00').toISOString();
    const initial: EventResponseDto = {
      id: 'e', householdId: 'h', title: '打疫苗', description: null, startTime: start, endTime: new Date('2030-10-01T16:30:00').toISOString(),
      allDay: false, location: null, recurrenceRuleId: null, occurrenceDate: null, cancelledAt: null, recurrence: null,
      createdBy: 'mom', createdAt: start, updatedAt: start, labels: [], myReminder: { mode: 'default', minutesBefore: null },
    };
    const view = await render(
      <MuchakuchaThemeProvider>
        <EventForm initial={initial} isSubmitting={false} onCancel={jest.fn()} onSubmit={onSubmit} submitLabel="保存" />
      </MuchakuchaThemeProvider>,
    );
    expect(view.getByRole('button', { name: '提醒我，开始前 15 分钟提醒（默认）' })).toBeTruthy();
    await fireEvent(view.getByLabelText('全天日程'), 'valueChange', true);
    expect(view.getByRole('button', { name: '提醒我，当天 09:00 提醒（默认）' })).toBeTruthy();
    await fireEvent.press(view.getByLabelText('保存'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][1]).toEqual({ contentChanged: true });
  });
});
