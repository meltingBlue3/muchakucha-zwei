import type { RecurrenceDto, TaskResponseDto } from '@muchakucha/api-client';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useState } from 'react';

import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { TaskForm } from '../../tasks/task-form';
import { RecurrencePicker } from '../recurrence-picker';

jest.mock('../../../ui/date-field', () => ({
  DateField: ({ accessibilityLabel, onChange, value }: { accessibilityLabel?: string; onChange(value: string): void; value: string }) => {
    const { TextInput } = require('react-native') as typeof import('react-native');
    return <TextInput accessibilityLabel={accessibilityLabel} onChangeText={onChange} value={value} />;
  },
}));

interface HarnessProps {
  disabled?: boolean;
  initial?: RecurrenceDto | null;
  onChangeSpy?: jest.Mock;
  onValidityChange?: jest.Mock;
  startDate?: string;
}

function Harness({
  disabled = false,
  initial = null,
  onChangeSpy,
  onValidityChange,
  startDate = '2026-08-12',
}: HarnessProps) {
  const [value, setValue] = useState<RecurrenceDto | null>(initial);
  return (
    <MuchakuchaThemeProvider>
      <RecurrencePicker
        disabled={disabled}
        onChange={(next) => {
          setValue(next);
          onChangeSpy?.(next);
        }}
        {...(onValidityChange === undefined ? {} : { onValidityChange })}
        startDate={startDate}
        value={value}
      />
    </MuchakuchaThemeProvider>
  );
}

describe('RecurrencePicker', () => {
  test('defaults to no recurrence and keeps all dependent controls unmounted', async () => {
    const view = await render(<Harness />);
    expect(view.getByLabelText('不重复').props.accessibilityState.checked).toBe(true);
    expect(view.queryByLabelText('星期三')).toBeNull();
    expect(view.queryByLabelText('重复结束条件')).toBeNull();
    expect(view.queryByText('结束')).toBeNull();
  });

  test('uses radio groups for frequency and ending, with checkbox weekdays', async () => {
    const view = await render(<Harness />);
    expect(view.getByLabelText('重复频率').props.accessibilityRole).toBe('radiogroup');
    expect(view.getAllByRole('radio')).toHaveLength(5);

    await fireEvent.press(view.getByLabelText('每周'));
    expect(view.getByLabelText('重复结束条件').props.accessibilityRole).toBe('radiogroup');
    expect(view.getAllByRole('radio')).toHaveLength(8);
    expect(view.getAllByRole('checkbox')).toHaveLength(7);
  });

  test('selects the start-date weekday when weekly is chosen', async () => {
    const view = await render(<Harness startDate="2026-08-12" />);
    await fireEvent.press(view.getByLabelText('每周'));

    expect(view.getByLabelText('星期三').props.accessibilityState.checked).toBe(true);
    expect(
      view.getAllByRole('checkbox').filter((chip) => chip.props.accessibilityState.checked),
    ).toHaveLength(1);
  });

  test('keeps the last weekday selected and announces the constraint', async () => {
    const view = await render(<Harness />);
    await fireEvent.press(view.getByLabelText('每周'));
    await fireEvent.press(view.getByLabelText('星期三'));

    expect(view.getByLabelText('星期三').props.accessibilityState.checked).toBe(true);
    const announcement = view.getByText('至少需要选择一天。');
    expect(announcement.props.accessibilityLiveRegion).toBe('polite');
  });

  test('clears the other ending value whenever the ending mode changes', async () => {
    const onChange = jest.fn();
    const view = await render(<Harness onChangeSpy={onChange} />);
    await fireEvent.press(view.getByLabelText('每天'));
    await fireEvent.press(view.getByLabelText('截止日期'));
    const dateInput = view.getAllByLabelText('截止日期').find((node) => node.props.value !== undefined)!;
    await fireEvent.changeText(dateInput, '2027-08-12');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ endsOn: '2027-08-12' }));

    await fireEvent.press(view.getByLabelText('重复次数'));
    expect(view.getAllByLabelText('截止日期')).toHaveLength(1);
    expect(
      view.getAllByLabelText('重复次数').find((node) => node.props.value !== undefined)?.props.value,
    ).toBe('10');
    expect(onChange).toHaveBeenLastCalledWith(expect.not.objectContaining({ endsOn: expect.anything() }));

    await fireEvent.press(view.getByLabelText('截止日期'));
    expect(view.getAllByLabelText('重复次数')).toHaveLength(1);
    expect(onChange).toHaveBeenLastCalledWith(expect.not.objectContaining({ count: expect.anything() }));
  });

  test.each(['0', '1001'])('rejects an out-of-range count of %s', async (count) => {
    const onValidityChange = jest.fn();
    const view = await render(<Harness onValidityChange={onValidityChange} />);
    await fireEvent.press(view.getByLabelText('每天'));
    await fireEvent.press(view.getByLabelText('重复次数'));
    const countInput = view.getAllByLabelText('重复次数').find((node) => node.props.value !== undefined)!;
    await fireEvent.changeText(countInput, count);

    expect(view.getByText('重复次数需要在 1 到 1000 之间。')).toBeTruthy();
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
  });

  test('requires a cutoff date and requires it to be after the start date', async () => {
    const onValidityChange = jest.fn();
    const view = await render(<Harness onValidityChange={onValidityChange} />);
    await fireEvent.press(view.getByLabelText('每天'));
    await fireEvent.press(view.getByLabelText('截止日期'));
    expect(view.getByText('请选择重复的截止日期。')).toBeTruthy();

    const dateInput = view.getAllByLabelText('截止日期').find((node) => node.props.value !== undefined)!;
    await fireEvent.changeText(dateInput, '2026-08-11');
    expect(view.getByText('截止日期必须晚于开始日期。')).toBeTruthy();
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
  });

  test('returns null and unmounts dependent controls when recurrence is turned off', async () => {
    const onChange = jest.fn();
    const view = await render(<Harness onChangeSpy={onChange} />);
    await fireEvent.press(view.getByLabelText('每周'));
    await fireEvent.press(view.getByLabelText('不重复'));

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(view.queryByLabelText('星期三')).toBeNull();
    expect(view.queryByText('结束')).toBeNull();
  });

  test('disables every mounted control without losing the selected values', async () => {
    const initial: RecurrenceDto = {
      freq: 'weekly',
      interval: 1,
      byWeekday: [2, 4],
      startsOn: '2026-08-12',
      count: 10,
      timezone: 'Asia/Shanghai',
    };
    const view = await render(<Harness disabled initial={initial} />);

    for (const control of [...view.getAllByRole('radio'), ...view.getAllByRole('checkbox')]) {
      expect(control.props.accessibilityState.disabled).toBe(true);
    }
    const countInput = view.getAllByLabelText('重复次数').find((node) => node.props.value !== undefined)!;
    expect(countInput.props.accessibilityState.disabled).toBe(true);
    expect(countInput.props.value).toBe('10');
  });

  test('never renders interval controls or recurrence implementation vocabulary', async () => {
    const view = await render(<Harness />);
    await fireEvent.press(view.getByLabelText('每周'));
    const tree = JSON.stringify(view.toJSON());
    expect(tree).not.toMatch(/每 N 个|RRULE|FREQ|BYDAY|interval|occurrenceDate/);
  });

  test('reports valid state again after fixing a field', async () => {
    const onValidityChange = jest.fn();
    const view = await render(<Harness onValidityChange={onValidityChange} />);
    await fireEvent.press(view.getByLabelText('每天'));
    await fireEvent.press(view.getByLabelText('重复次数'));
    const countInput = view.getAllByLabelText('重复次数').find((node) => node.props.value !== undefined)!;
    await fireEvent.changeText(countInput, '0');
    await fireEvent.changeText(countInput, '12');
    await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(true));
  });
});

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

    expect(view.getByLabelText('已取消').props.accessibilityState).toEqual({
      checked: true,
      disabled: true,
    });
    expect(view.getByLabelText('每周').props.accessibilityState.checked).toBe(true);
    await fireEvent.press(view.getByLabelText('恢复这一次'));
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

    expect(view.getByLabelText('不重复').props.accessibilityState.disabled).toBe(false);
  });
});
