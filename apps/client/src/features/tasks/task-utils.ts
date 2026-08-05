const STATUS_LABELS: Record<string, string> = {
  pending: '待办',
  in_progress: '进行中',
  completed: '已完成',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急',
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function priorityLabel(priority: string): string {
  return PRIORITY_LABELS[priority] ?? priority;
}

export function formatDueDate(iso: string | null): string {
  if (iso === null || iso === '') return '';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isOverdue(dueDateIso: string | null): boolean {
  if (dueDateIso === null || dueDateIso === '') return false;
  const due = new Date(dueDateIso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

/**
 * Returns true when the due date falls within the next `withinDays` days
 * (inclusive of the end date, exclusive of today).
 */
export function isApproachingDeadline(
  dueDateIso: string | null,
  withinDays: number = 7,
): boolean {
  if (dueDateIso === null || dueDateIso === '') return false;
  const due = new Date(dueDateIso);
  const now = new Date();

  // Exclude overdue tasks — those are handled separately.
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  if (due < todayStart) return false;

  // Exclude today's tasks — they already appear in the "today" bucket.
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const dueStr = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
  if (dueStr === todayStr) return false;

  // Compute the cutoff: end of the window (today + withinDays).
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + withinDays);
  cutoff.setHours(23, 59, 59, 999);

  return due <= cutoff;
}
