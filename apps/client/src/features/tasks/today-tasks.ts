import type { TaskResponseDto } from '@muchakucha/api-client';

import { toDateIso } from '../events/calendar-utils';
import { isApproachingDeadline, isOverdue } from './task-utils';

function isToday(iso: string | null): boolean {
  if (iso === null || iso === '') return false;
  return toDateIso(new Date(iso)) === toDateIso(new Date());
}

/**
 * `retainCompletedId` keeps one just-completed task in its bucket while the
 * top undo notice is open, so the card the person just checked stays in place
 * until they undo or dismiss it instead of vanishing with the refetch.
 */
export function partitionTodayTasks(tasks: TaskResponseDto[], retainCompletedId: string | null = null) {
  const overdueTasks: TaskResponseDto[] = [];
  const todayTasks: TaskResponseDto[] = [];
  const unscheduledTasks: TaskResponseDto[] = [];
  const approachingTasks: TaskResponseDto[] = [];
  const otherUpcomingTasks: TaskResponseDto[] = [];

  for (const task of tasks) {
    const retained = task.id === retainCompletedId && task.status === 'completed';
    if (!retained && (task.status === 'completed' || task.status === 'cancelled')) continue;
    const dueDate = task.dueDate ?? null;
    // A task with no due date is unscheduled, not due today. Folding the two
    // together presented "no date" as "due today" and inflated the count the
    // summary reports, so the absence of a date is decided first and never
    // relies on how the date helpers treat null.
    if (dueDate === null || dueDate === '') {
      unscheduledTasks.push(task);
    } else if (isOverdue(dueDate)) {
      overdueTasks.push(task);
    } else if (isToday(dueDate)) {
      todayTasks.push(task);
    } else if (isApproachingDeadline(dueDate, 7)) {
      approachingTasks.push(task);
    } else {
      otherUpcomingTasks.push(task);
    }
  }

  // Only future reminders collapse a series. Today's work and missed
  // occurrences remain independently actionable. Select by due date, since
  // the API orders by priority before date and individual instances can differ.
  const nearestByRule = new Map<string, TaskResponseDto>();
  for (const task of [...approachingTasks, ...otherUpcomingTasks]) {
    if (task.recurrenceRuleId == null) continue;
    const previous = nearestByRule.get(task.recurrenceRuleId);
    if (previous === undefined || new Date(task.dueDate!).getTime() < new Date(previous.dueDate!).getTime()) {
      nearestByRule.set(task.recurrenceRuleId, task);
    }
  }
  const isNearest = (task: TaskResponseDto) =>
    task.recurrenceRuleId == null || nearestByRule.get(task.recurrenceRuleId)?.id === task.id;

  return {
    overdueTasks, todayTasks, unscheduledTasks,
    approachingTasks: approachingTasks.filter(isNearest),
    otherUpcomingTasks: otherUpcomingTasks.filter(isNearest),
  };
}
