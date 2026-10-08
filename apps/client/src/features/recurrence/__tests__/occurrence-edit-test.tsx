import type { CreateEventDto, CreateTaskDto, EventResponseDto, RecurrenceResponseDto, TaskResponseDto } from '@muchakucha/api-client';
import { fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';

import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { EventForm } from '../../events/event-form';
import { TaskForm } from '../../tasks/task-form';
import { recurrenceInputFromResponse } from '../recurrence-options';
import { seriesScopeModeFor } from '../series-scope-mode';
import { SeriesScopeContent } from '../series-scope-sheet';

jest.mock('../../../ui/date-field', () => ({
  DateField: ({ accessibilityLabel, onChange, value }: { accessibilityLabel?: string; onChange(value: string): void; value: string }) => {
    const { TextInput } = require('react-native') as typeof import('react-native');
    return <TextInput accessibilityLabel={accessibilityLabel} onChangeText={onChange} value={value} />;
  },
}));

const rule: RecurrenceResponseDto = {
  id: 'rule', updatedAt: '2026-09-01T00:00:00.000Z',
  freq: 'weekly', interval: 1, byWeekday: [1], startsOn: '2026-09-28',
  endsOn: null, count: null, timezone: 'Asia/Shanghai', startTimeLocal: '09:00', durationMinutes: 60,
};
const common = {
  id: 'item', householdId: 'household', title: '家庭安排', description: null,
  createdBy: 'user', createdAt: rule.updatedAt, updatedAt: rule.updatedAt,
  recurrenceRuleId: rule.id, occurrenceDate: '2026-10-05', labels: [],
};

type Kind = 'event' | 'task';

// Exercise the real form, repeat field and scope chooser together. Only the
// platform date picker is replaced with text entry; no server is involved.
function EditFlow({ kind, recurrence, onSubmit, onSelect }: {
  kind: Kind;
  recurrence: RecurrenceResponseDto;
  onSubmit: jest.Mock;
  onSelect: jest.Mock;
}) {
  const [pending, setPending] = useState<CreateEventDto | CreateTaskDto | null>(null);
  const submit = async (data: CreateEventDto | CreateTaskDto) => { onSubmit(data); setPending(data); };
  const event: EventResponseDto = {
    ...common, recurrence, startTime: new Date('2026-10-05T09:00:00').toISOString(),
    endTime: new Date('2026-10-05T10:00:00').toISOString(), allDay: false, location: null, cancelledAt: null,
  };
  const task: TaskResponseDto = {
    ...common, recurrence, dueDate: new Date('2026-10-05T09:00:00').toISOString(),
    status: 'pending', priority: 'medium', assigneeIds: [],
  };
  return <MuchakuchaThemeProvider>
    {pending ? <SeriesScopeContent mode={seriesScopeModeFor(recurrence, pending.recurrence)} onClose={jest.fn()} onSelect={onSelect} />
      : kind === 'event'
        ? <EventForm initial={event} isSubmitting={false} onCancel={jest.fn()} onSubmit={submit} submitLabel="保存" />
        : <TaskForm initial={task} members={[]} isSubmitting={false} onCancel={jest.fn()} onSubmit={submit} submitLabel="保存" />}
  </MuchakuchaThemeProvider>;
}

describe.each<Kind>(['event', 'task'])('%s occurrence editing', kind => {
  const dateLabel = kind === 'event' ? '开始日期' : '截止日期';
  const timeLabel = kind === 'event' ? '开始时间' : '截止时间';
  const repeatLabel = kind === 'event' ? /^日程重复设置，/ : /^任务重复设置，/;

  test.each<[string, RecurrenceResponseDto, string]>([
    ['time only', rule, '2026-10-05'],
    ['weekly', rule, '2026-10-06'],
    ['monthly', { ...rule, freq: 'monthly', byWeekday: [] }, '2026-10-06'],
    ['yearly', { ...rule, freq: 'yearly', byWeekday: [] }, '2026-11-06'],
    ['past the series end', { ...rule, endsOn: '2026-10-12' }, '2026-10-13'],
  ])('moving %s date and time preserves the rule and allows this occurrence only', async (_name, recurrence, date) => {
    const onSubmit = jest.fn();
    const onSelect = jest.fn();
    const view = await render(<EditFlow kind={kind} recurrence={recurrence} onSubmit={onSubmit} onSelect={onSelect} />);
    const summary = view.getByRole('button', { name: repeatLabel }).props.accessibilityLabel;
    await fireEvent.changeText(view.getByLabelText(dateLabel), date);
    await fireEvent.changeText(view.getByLabelText(timeLabel), '11:30');
    expect(view.getByRole('button', { name: repeatLabel }).props.accessibilityLabel).toBe(summary);
    await fireEvent.press(view.getByRole('button', { name: '保存' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      recurrence: recurrenceInputFromResponse(recurrence),
      [kind === 'event' ? 'startTime' : 'dueDate']: new Date(`${date}T11:30:00`).toISOString(),
      ...(kind === 'event' ? { endTime: new Date(`${date}T12:30:00`).toISOString() } : {}),
    }));
    expect(view.getByRole('radio', { name: '仅此一次' }).props.accessibilityState).toMatchObject({ disabled: false, checked: true });
    await fireEvent.press(view.getByRole('button', { name: '保存' }));
    expect(onSelect).toHaveBeenCalledWith('this_only');
  });

  test('an explicit repeat change still requires this and following', async () => {
    const view = await render(<EditFlow kind={kind} recurrence={rule} onSubmit={jest.fn()} onSelect={jest.fn()} />);
    await fireEvent.press(view.getByRole('button', { name: repeatLabel }));
    await fireEvent.press(view.getByRole('radio', { name: '每天' }));
    await fireEvent.press(view.getByRole('button', { name: '保存' }));
    expect(view.getByRole('radio', { name: '仅此一次' }).props.accessibilityState.disabled).toBe(true);
    expect(view.getByRole('radio', { name: '此后所有' }).props.accessibilityState.checked).toBe(true);
  });
});

test('a newly created event still aligns its weekly repeat with its start date', async () => {
  const onSubmit = jest.fn().mockResolvedValue(undefined);
  const view = await render(<MuchakuchaThemeProvider>
    <EventForm defaultDate="2026-10-05" isSubmitting={false} onCancel={jest.fn()} onSubmit={onSubmit} submitLabel="创建" />
  </MuchakuchaThemeProvider>);
  await fireEvent.changeText(view.getByLabelText('日程标题'), '家庭安排');
  await fireEvent.press(view.getByRole('button', { name: '日程重复设置，不重复' }));
  await fireEvent.press(view.getByRole('radio', { name: '每周' }));
  await fireEvent.changeText(view.getByLabelText('开始日期'), '2026-10-06');
  await fireEvent.press(view.getByRole('button', { name: '创建' }));
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ recurrence: expect.objectContaining({ startsOn: '2026-10-06', byWeekday: [2] }) }));
});
