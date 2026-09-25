import type { TaskResponseDto } from '@muchakucha/api-client';
import { fireEvent, render } from '@testing-library/react-native';

import { partitionTodayTasks } from '../../../../app/(protected)/households/[id]/today';
import { completionToggleTarget, completionActionLabel } from '../task-completion';
import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { TaskCard } from '../task-card';

function dateAtOffset(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function task(overrides: Partial<TaskResponseDto>): TaskResponseDto {
  return {
    id: 'task-1',
    householdId: 'household-1',
    title: '重复家务',
    description: null,
    status: 'pending',
    priority: 'medium',
    assigneeIds: [],
    dueDate: dateAtOffset(0),
    recurrenceRuleId: 'rule-1',
    occurrenceDate: dateAtOffset(0).slice(0, 10),
    recurrence: null,
    createdBy: 'user-1',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    labels: [],
    ...overrides,
  };
}

describe('cancelled task status', () => {
  test('status and detail controls are independent actions', async () => {
    const onPress = jest.fn();
    const onStatusChange = jest.fn();
    const item = task({ status: 'pending' });
    const view = await render(<MuchakuchaThemeProvider><TaskCard task={item} onPress={onPress} onToggleComplete={onStatusChange} /></MuchakuchaThemeProvider>);
    await fireEvent.press(view.getByRole('button', { name: '完成任务' }));
    expect(onStatusChange).toHaveBeenCalledWith(item);
    expect(onPress).not.toHaveBeenCalled();
    await fireEvent.press(view.getByRole('button', { name: '任务：重复家务，重复' }));
    expect(onPress).toHaveBeenCalledWith(item);
    expect(onStatusChange).toHaveBeenCalledTimes(1);
  });
  test('completed past-due tasks do not retain the overdue warning', async () => {
    const view = await render(<MuchakuchaThemeProvider><TaskCard task={task({ status: 'completed', dueDate: dateAtOffset(-2) })} onPress={jest.fn()} /></MuchakuchaThemeProvider>);
    expect(view.getByText('已完成')).toBeTruthy();
    expect(view.queryByText('逾期')).toBeNull();
  });

  test.each([
    ['due today', dateAtOffset(0)],
    ['overdue', dateAtOffset(-2)],
    ['without a due date', null],
  ])('excludes a cancelled task %s from every Today partition', (_label, dueDate) => {
    const partitions = partitionTodayTasks([task({ status: 'cancelled', dueDate })]);

    expect(partitions.todayTasks).toHaveLength(0);
    expect(partitions.overdueTasks).toHaveLength(0);
    expect(partitions.unscheduledTasks).toHaveLength(0);
    expect(partitions.approachingTasks).toHaveLength(0);
    expect(partitions.otherUpcomingTasks).toHaveLength(0);
  });

  test('keeps a pending task in 今日待办 while filtering a cancelled sibling', () => {
    const pending = task({ id: 'pending', title: '正常任务' });
    const cancelled = task({ id: 'cancelled', status: 'cancelled' });

    expect(partitionTodayTasks([pending, cancelled]).todayTasks).toEqual([pending]);
  });

  test('offers no completion toggle for a cancelled occurrence', () => {
    expect(completionToggleTarget('cancelled')).toBeNull();
    expect(completionActionLabel('cancelled')).toBe('这次重复已取消');
  });

  test('renders cancellation text and strikethrough with a disabled status control', async () => {
    const onStatusChange = jest.fn();
    const view = await render(
      <MuchakuchaThemeProvider>
        <TaskCard
          onPress={jest.fn()}
          onToggleComplete={onStatusChange}
          task={task({ status: 'cancelled' })}
        />
      </MuchakuchaThemeProvider>,
    );

    expect(view.getByText('已取消')).toBeTruthy();
    expect(view.getByText('重复家务').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ textDecorationLine: 'line-through' })]),
    );
    const toggle = view.getByLabelText('这次重复已取消');
    expect(toggle.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(toggle);
    expect(onStatusChange).not.toHaveBeenCalled();
  });
});

describe('unscheduled tasks are separated from today', () => {
  test.each([
    ['null', null],
    ['an empty string', ''],
  ])('a task whose due date is %s is unscheduled, not due today', (_label, dueDate) => {
    const item = task({ id: 'no-date', title: '修水龙头', dueDate });

    const partitions = partitionTodayTasks([item]);

    expect(partitions.unscheduledTasks).toEqual([item]);
    expect(partitions.todayTasks).toHaveLength(0);
    expect(partitions.overdueTasks).toHaveLength(0);
    expect(partitions.approachingTasks).toHaveLength(0);
    expect(partitions.otherUpcomingTasks).toHaveLength(0);
  });

  test('a task actually due today stays in 今日待办', () => {
    const item = task({ id: 'today', dueDate: dateAtOffset(0) });

    const partitions = partitionTodayTasks([item]);

    expect(partitions.todayTasks).toEqual([item]);
    expect(partitions.unscheduledTasks).toHaveLength(0);
  });

  test('the today count the summary reports excludes undated work', () => {
    const dueToday = task({ id: 'today', dueDate: dateAtOffset(0) });
    const undated = [
      task({ id: 'undated-1', dueDate: null }),
      task({ id: 'undated-2', dueDate: null }),
    ];

    const partitions = partitionTodayTasks([dueToday, ...undated]);

    // TodaySummary is handed todayTasks.length, so undated work leaking in here
    // is what made the headline number untrustworthy.
    expect(partitions.todayTasks).toHaveLength(1);
    expect(partitions.unscheduledTasks).toHaveLength(2);
  });

  test('an undated task is never reported as overdue', () => {
    const partitions = partitionTodayTasks([task({ id: 'no-date', dueDate: null })]);

    expect(partitions.overdueTasks).toHaveLength(0);
  });
});
