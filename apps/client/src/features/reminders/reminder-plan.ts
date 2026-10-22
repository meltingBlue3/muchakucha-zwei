import type { UpcomingReminderDto } from '@muchakucha/api-client';
import { REMINDER_ID_PREFIX, type ReminderNotification } from '../../platform/reminders/reminder-types';
import { formatDate, toDateValue, toTimeValue } from '../../ui/date-values';

function startOfDay(date: Date): number {
  return new Date(`${toDateValue(date)}T00:00:00`).getTime();
}

/** 今天 / 明天, counted from the moment the notification appears, else the date. */
function dayWord(at: Date, fireAt: Date): string {
  const days = Math.round((startOfDay(at) - startOfDay(fireAt)) / 86_400_000);
  if (days === 0) return '今天';
  if (days === 1) return '明天';
  return formatDate(at, {}, fireAt);
}

// Short and stable; any change to what the notification says gives it a new id.
function hash(text: string): string {
  let value = 5381;
  for (let index = 0; index < text.length; index += 1) value = ((value << 5) + value + text.charCodeAt(index)) | 0;
  return (value >>> 0).toString(36);
}

/**
 * The notification for one reminder: the title is the content's own, the body
 * says when, then where, then — for someone in several households — whose.
 */
export function reminderNotification(reminder: UpcomingReminderDto, { showHousehold }: { showHousehold: boolean }): ReminderNotification {
  const at = new Date(reminder.at);
  const fireAt = new Date(reminder.fireAt);
  const day = dayWord(at, fireAt);
  const when = reminder.kind === 'task'
    ? reminder.dateOnly ? `${day}到期` : `${day} ${toTimeValue(at)} 到期`
    : reminder.dateOnly ? `${day}全天` : `${day} ${toTimeValue(at)} 开始`;
  const body = [when, reminder.kind === 'event' ? reminder.location : null, showHousehold ? reminder.householdName : null]
    .filter((part): part is string => typeof part === 'string' && part !== '')
    .join(' · ');
  const household = `/households/${encodeURIComponent(reminder.householdId)}`;
  // A series occurrence without a row yet has nothing to open but its day.
  const url = reminder.itemId === null
    ? `${household}/today`
    : `${household}/${reminder.kind === 'task' ? 'tasks' : 'events'}/${encodeURIComponent(reminder.itemId)}`;
  return {
    id: `${REMINDER_ID_PREFIX}${reminder.key}@${fireAt.getTime()}#${hash(`${reminder.title}\n${body}\n${url}`)}`,
    kind: reminder.kind,
    title: reminder.title,
    body,
    fireAt,
    url,
  };
}

/** What to cancel and what to add so the phone holds exactly `wanted`. */
export function reminderChanges(scheduledIds: readonly string[], wanted: readonly ReminderNotification[]): { cancel: string[]; schedule: ReminderNotification[] } {
  const keep = new Set(wanted.map(notification => notification.id));
  const scheduled = new Set(scheduledIds);
  return {
    cancel: scheduledIds.filter(id => !keep.has(id)),
    schedule: wanted.filter(notification => !scheduled.has(notification.id)),
  };
}
