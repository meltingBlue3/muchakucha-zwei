import type { EventResponseDto, TaskResponseDto } from '@muchakucha/api-client';

/** The 总览 shows a person their own work: tasks assigned to them, and tasks nobody has taken yet. */
export function isMineOrUnassigned(task: Pick<TaskResponseDto, 'assigneeIds'>, userId: string): boolean {
  return task.assigneeIds.length === 0 || task.assigneeIds.includes(userId);
}

const isOpen = (task: Pick<TaskResponseDto, 'status'>) => task.status !== 'completed' && task.status !== 'cancelled';

/**
 * The tasks a 总览 page lists, and how many open tasks it leaves out because
 * they belong to other family members, so the page can say so.
 */
export function overviewTasks<T extends Pick<TaskResponseDto, 'assigneeIds' | 'status'>>(tasks: readonly T[], userId: string | null, showAll: boolean): { shown: T[]; othersOpen: number } {
  if (showAll || userId === null) return { shown: [...tasks], othersOpen: 0 };
  const shown: T[] = [];
  let othersOpen = 0;
  for (const task of tasks) {
    if (isMineOrUnassigned(task, userId)) shown.push(task);
    else if (isOpen(task)) othersOpen += 1;
  }
  return { shown, othersOpen };
}

type ClashSource = Pick<EventResponseDto, 'id' | 'householdId' | 'startTime' | 'endTime' | 'allDay'>;

/**
 * Timed events of different households that overlap. The later one (by start,
 * then by id) is keyed to the earlier one it runs into, so a list can say so
 * under the later row only. All-day events and touching ends do not clash.
 */
export function householdClashes<T extends ClashSource>(events: readonly T[]): Map<string, T> {
  const timed = events
    .filter(event => !event.allDay)
    .map(event => ({ event, start: Date.parse(event.startTime), end: Date.parse(event.endTime) }))
    .filter(entry => Number.isFinite(entry.start) && Number.isFinite(entry.end) && entry.end > entry.start)
    .sort((a, b) => a.start - b.start || a.event.id.localeCompare(b.event.id));
  const clashes = new Map<string, T>();
  timed.forEach((later, index) => {
    for (let i = 0; i < index; i += 1) {
      const earlier = timed[i]!;
      if (earlier.event.householdId !== later.event.householdId && earlier.end > later.start) {
        clashes.set(later.event.id, earlier.event);
        return;
      }
    }
  });
  return clashes;
}
