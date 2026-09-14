import type { TaskResponseDto } from '@muchakucha/api-client';
import { fireEvent, render } from '@testing-library/react-native';

import { partitionTodayTasks, nextTaskStatus } from '../../../../app/(protected)/households/[id]/today';
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
    expect(partitions.approachingTasks).toHaveLength(0);
    expect(partitions.otherUpcomingTasks).toHaveLength(0);
  });

  test('keeps a pending task in 今日待办 while filtering a cancelled sibling', () => {
    const pending = task({ id: 'pending', title: '正常任务' });
    const cancelled = task({ id: 'cancelled', status: 'cancelled' });

    expect(partitionTodayTasks([pending, cancelled]).todayTasks).toEqual([pending]);
  });

  test('makes the status cycle a no-op for cancelled tasks', () => {
    expect(nextTaskStatus('cancelled')).toBeNull();
    expect(nextTaskStatus('pending')).toBe('in_progress');
  });

  test('renders cancellation text and strikethrough with a disabled status control', async () => {
    const onStatusChange = jest.fn();
    const view = await render(
      <MuchakuchaThemeProvider>
        <TaskCard
          onPress={jest.fn()}
          onStatusChange={onStatusChange}
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
