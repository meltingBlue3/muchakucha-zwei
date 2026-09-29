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

  test('a one-off task can carry a due time', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const view = await render(
      <MuchakuchaThemeProvider>
        <TaskForm isSubmitting={false} members={[]} onCancel={jest.fn()} onSubmit={onSubmit} submitLabel="创建" />
      </MuchakuchaThemeProvider>,
    );
    await fireEvent.changeText(view.getByLabelText('任务标题'), '交水费');
    await fireEvent.changeText(view.getByLabelText('截止日期'), '2030-10-01');
    await fireEvent.changeText(view.getByLabelText('截止时间'), '12:00');
    await fireEvent.press(view.getByLabelText('创建'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].dueDate).toBe(new Date('2030-10-01T12:00:00').toISOString());
  });

  test('a time picked before any date means today', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const view = await render(
      <MuchakuchaThemeProvider>
        <TaskForm isSubmitting={false} members={[]} onCancel={jest.fn()} onSubmit={onSubmit} submitLabel="创建" />
      </MuchakuchaThemeProvider>,
    );
    await fireEvent.changeText(view.getByLabelText('任务标题'), '取快递');
    await fireEvent.changeText(view.getByLabelText('截止时间'), '18:00');
    await fireEvent.press(view.getByLabelText('创建'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const today = new Date();
    today.setHours(18, 0, 0, 0);
    expect(onSubmit.mock.calls[0][0].dueDate).toBe(today.toISOString());
  });

  test('for a new recurring task the row sets the first day and the time', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const view = await render(
      <MuchakuchaThemeProvider>
        <TaskForm isSubmitting={false} members={[]} onCancel={jest.fn()} onSubmit={onSubmit} submitLabel="创建" />
      </MuchakuchaThemeProvider>,
    );
    await fireEvent.changeText(view.getByLabelText('任务标题'), '周会材料');
    await fireEvent.press(view.getByRole('button', { name: '任务重复设置，不重复' }));
    await fireEvent.press(view.getByRole('radio', { name: '每周' }));
    await fireEvent.changeText(view.getByLabelText('首次截止日期'), '2030-10-03');
    await fireEvent.changeText(view.getByLabelText('每次的截止时间'), '12:00');
    await fireEvent.press(view.getByLabelText('创建'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // 2030-10-03 is a Thursday: the weekly day moves with the first day.
    expect(onSubmit.mock.calls[0][0].recurrence).toMatchObject({ freq: 'weekly', byWeekday: [4], startsOn: '2030-10-03', startTimeLocal: '12:00' });
  });

  test('a preset repeat takes its time from the due row', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const view = await render(
      <MuchakuchaThemeProvider>
        <TaskForm isSubmitting={false} members={[]} onCancel={jest.fn()} onSubmit={onSubmit} submitLabel="创建" />
      </MuchakuchaThemeProvider>,
    );
    await fireEvent.changeText(view.getByLabelText('任务标题'), '倒垃圾');
    await fireEvent.press(view.getByRole('button', { name: '任务重复设置，不重复' }));
    await fireEvent.press(view.getByRole('radio', { name: '每天' }));
    await fireEvent.changeText(view.getByLabelText('每次的截止时间'), '20:30');
    await fireEvent.press(view.getByLabelText('创建'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].recurrence).toMatchObject({ freq: 'daily', startTimeLocal: '20:30' });
  });

  test('editing keeps an existing due time', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const dueDate = new Date('2030-10-01T12:00:00').toISOString();
    const initial = { id: 't', householdId: 'h', title: '交水费', description: null, status: 'pending', priority: 'medium', assigneeIds: [], dueDate, recurrenceRuleId: null, occurrenceDate: null, recurrence: null, createdBy: 'u', createdAt: dueDate, updatedAt: dueDate, labels: [] } as TaskResponseDto;
    const view = await render(
      <MuchakuchaThemeProvider>
        <TaskForm initial={initial} isSubmitting={false} members={[]} onCancel={jest.fn()} onSubmit={onSubmit} submitLabel="保存" />
      </MuchakuchaThemeProvider>,
    );
    expect(view.getByLabelText('截止时间').props.value).toBe('12:00');
    await fireEvent.press(view.getByLabelText('保存'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].dueDate).toBe(dueDate);
  });

  test('a new recurring task takes its start date and time from the custom repeat page', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const view = await render(
      <MuchakuchaThemeProvider>
        <TaskForm isSubmitting={false} members={[]} onCancel={jest.fn()} onSubmit={onSubmit} submitLabel="创建" />
      </MuchakuchaThemeProvider>,
    );
    await fireEvent.changeText(view.getByLabelText('任务标题'), '浇花');
    await fireEvent.press(view.getByRole('button', { name: '任务重复设置，不重复' }));
    await fireEvent.press(view.getByRole('radio', { name: '自定义…' }));
    await fireEvent.changeText(view.getByLabelText('重复开始日期'), '2030-10-01');
    await fireEvent.changeText(view.getByLabelText('重复时间'), '12:00');
    await fireEvent.press(view.getByRole('button', { name: '完成' }));
    expect(view.getByText('从2030年10月1日开始，每次 12:00')).toBeTruthy();

    await fireEvent.press(view.getByLabelText('创建'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // 2030-10-01 is a Tuesday: the weekly default follows the chosen start.
    expect(onSubmit.mock.calls[0][0].recurrence).toMatchObject({ freq: 'weekly', byWeekday: [2], startsOn: '2030-10-01', startTimeLocal: '12:00' });
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
