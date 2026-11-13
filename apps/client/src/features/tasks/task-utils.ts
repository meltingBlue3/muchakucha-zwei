import { i18n } from '../../i18n';
import { formatDate, formatDateTime } from '../../ui/date-values';

export function statusLabel(status: string): string {
  return i18n.t(`tasks:status.${status}`, { defaultValue: status });
}

export function priorityLabel(priority: string): string {
  return i18n.t(`tasks:priority.${priority}`, { defaultValue: priority });
}

export function formatDueDate(iso: string | null): string {
  if (iso === null || iso === '') return '';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';
  // A due date without a time is stored as local midnight; a repeat with a
  // set time (for example 12:00) shows it.
  return date.getHours() === 0 && date.getMinutes() === 0 ? formatDate(date) : formatDateTime(date);
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
