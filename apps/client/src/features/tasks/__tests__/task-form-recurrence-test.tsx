import type { TaskResponseDto } from '@muchakucha/api-client';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { TaskForm } from '../task-form';

jest.mock('../../../ui/date-field', () => ({
  DateField: ({ accessibilityLabel, onChange, value }: { accessibilityLabel?: string; onChange(value: string): void; value: string }) => {
    const { TextInput } = require('react-native') as typeof import('react-native');
    return <TextInput accessibilityLabel={accessibilityLabel} onChangeText={onChange} value={value} />;
  },
}));

describe('task form recurrence integration', () => {
  test('keeps the pre-recurrence request body unchanged when recurrence is off', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const view = await render(
      <MuchakuchaThemeProvider>
        <TaskForm
          isSubmitting={false}
          members={[]}
          onCancel={jest.fn()}
          onSubmit={onSubmit}
          submitLabel="保存"
        />
      </MuchakuchaThemeProvider>,
    );
    await fireEvent.changeText(view.getByLabelText('任务标题'), '普通任务');
    await fireEvent.press(view.getByLabelText('保存'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.not.objectContaining({ recurrence: expect.anything() }));
  });

  test('submits a selected recurrence and restores a cancelled occurrence', async () => {
    const initial: TaskResponseDto = {
      id: 'task-1',
      householdId: 'household-1',
      title: '重复任务',
      description: null,
      status: 'cancelled',
      priority: 'medium',
      assigneeIds: [],
      dueDate: '2026-08-12T00:00:00.000Z',
      recurrenceRuleId: 'rule-1',
      occurrenceDate: '2026-08-12',
      recurrence: {
        updatedAt: '2026-01-01T00:00:00.000Z',
        id: 'rule-1',
        freq: 'weekly',
        interval: 1,
        byWeekday: [3],
        startsOn: '2026-08-12',
        endsOn: null,
        count: 10,
        timezone: 'Asia/Shanghai',
      },
      createdBy: 'user-1',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      labels: [],
    };
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const view = await render(
      <MuchakuchaThemeProvider>
        <TaskForm
          initial={initial}
          isSubmitting={false}
          members={[]}
          onCancel={jest.fn()}
          onSubmit={onSubmit}
          submitLabel="保存"
        />
      </MuchakuchaThemeProvider>,
    );

    expect(view.getByRole('button', { name: '任务状态，已取消' })).toBeTruthy();
    expect(view.getByRole('button', { name: '任务重复设置，每周三重复，共 10 次' })).toBeTruthy();
    await fireEvent.press(view.getByLabelText('恢复这一次'));
    expect(view.getByRole('button', { name: '任务状态，待办' })).toBeTruthy();
    await fireEvent.press(view.getByLabelText('保存'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'pending',
        recurrence: expect.objectContaining({ freq: 'weekly', count: 10 }),
      }),
    );
  });

  // WR-07 regression: an existing recurring task with no due date (the
  // field is optional) used to feed the picker startDate="", which its
  // startsOn-sync effect propagated straight into the submitted recurrence
  // — the exact "" that fails the server's format validation. The task
  // form must never submit an empty startsOn for an already-recurring item.
  test('never submits an empty startsOn when editing a recurring task with no due date', async () => {
    const initial: TaskResponseDto = {
      id: 'task-2',
      householdId: 'household-1',
      title: '没有截止日期的重复任务',
      description: null,
      status: 'pending',
      priority: 'medium',
      assigneeIds: [],
      dueDate: null,
      recurrenceRuleId: 'rule-2',
      occurrenceDate: '2026-08-12',
      recurrence: {
        updatedAt: '2026-01-01T00:00:00.000Z',
        id: 'rule-2',
        freq: 'weekly',
        interval: 1,
        byWeekday: [3],
        startsOn: '2026-08-12',
        endsOn: null,
        count: 10,
        timezone: 'Asia/Shanghai',
      },
      createdBy: 'user-1',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      labels: [],
    };
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const view = await render(
      <MuchakuchaThemeProvider>
        <TaskForm
          initial={initial}
          isSubmitting={false}
          members={[]}
          onCancel={jest.fn()}
          onSubmit={onSubmit}
          submitLabel="保存"
        />
      </MuchakuchaThemeProvider>,
    );

    await fireEvent.press(view.getByLabelText('保存'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const submitted = onSubmit.mock.calls[0]![0] as { recurrence?: { startsOn?: string } };
    expect(submitted.recurrence?.startsOn).not.toBe('');
    expect(submitted.recurrence?.startsOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // CR-03 regression: the /series endpoint has no way to detach an
  // occurrence into a standalone item, so 不重复 must not be offered as a
  // live option when editing a task that already has a recurrence rule.
  test('disables 不重复 when editing an already-recurring task', async () => {
    const initial: TaskResponseDto = {
      id: 'task-3',
      householdId: 'household-1',
      title: '重复任务',
      description: null,
      status: 'pending',
      priority: 'medium',
      assigneeIds: [],
      dueDate: '2026-08-12T00:00:00.000Z',
      recurrenceRuleId: 'rule-3',
      occurrenceDate: '2026-08-12',
      recurrence: {
        updatedAt: '2026-01-01T00:00:00.000Z',
        id: 'rule-3',
        freq: 'daily',
        interval: 1,
        byWeekday: [],
        startsOn: '2026-08-12',
        endsOn: null,
        count: null,
        timezone: 'Asia/Shanghai',
      },
      createdBy: 'user-1',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      labels: [],
    };
    const view = await render(
      <MuchakuchaThemeProvider>
        <TaskForm
          initial={initial}
          isSubmitting={false}
          members={[]}
          onCancel={jest.fn()}
          onSubmit={jest.fn()}
          submitLabel="保存"
        />
      </MuchakuchaThemeProvider>,
    );

    await fireEvent.press(view.getByRole('button', { name: /^任务重复设置，/ }));
    expect(view.getByLabelText('不重复').props.accessibilityState.disabled).toBe(true);
    expect(view.getByText('如需彻底停止这个重复，请到规则详情页使用「结束此重复」。')).toBeTruthy();
  });

  // Create mode must NOT disable 不重复 — there is no existing series to
  // silently fail to detach from; it is simply the default, valid choice.
  test('leaves 不重复 enabled when creating a new task', async () => {
    const view = await render(
      <MuchakuchaThemeProvider>
        <TaskForm
          isSubmitting={false}
          members={[]}
          onCancel={jest.fn()}
          onSubmit={jest.fn()}
          submitLabel="保存"
        />
      </MuchakuchaThemeProvider>,
    );

    await fireEvent.press(view.getByRole('button', { name: '任务重复设置，不重复' }));
    expect(view.getByLabelText('不重复').props.accessibilityState.disabled).toBe(false);
  });
});
