import type { ReminderChoiceDto, ReminderSettingsDto } from '@muchakucha/api-client';
import { formatDateTime, toDateValue, toTimeValue } from '../../ui/date-values';

export type ReminderKind = 'task' | 'event';
export type ReminderDefaults = Pick<ReminderSettingsDto, 'taskMinutesBefore' | 'eventMinutesBefore' | 'dateOnlyTime'>;

export const DEFAULT_REMINDER: ReminderChoiceDto = { mode: 'default', minutesBefore: null };

/** What a reminder can be set to. Minutes count back from the due or start time, or from the date-only time on that day. */
export const TIMED_REMINDER_MINUTES = [0, 5, 15, 30, 60, 1440] as const;
export const DATE_ONLY_REMINDER_MINUTES = [0, 1440] as const;

/** A choice as an option value: 'default', 'off' or the minutes before. */
export type ReminderOptionValue = 'default' | 'off' | `${number}`;

function span(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440} 天`;
  if (minutes % 60 === 0) return `${minutes / 60} 小时`;
  return `${minutes} 分钟`;
}

/**
 * "准时" / "提前 30 分钟" for a task, "开始时" / "开始前 30 分钟" for an event,
 * and the clock time for a date-only item: "当天 09:00", "前一天 09:00".
 */
export function minutesLabel(minutes: number, kind: ReminderKind, dateOnly: boolean, dateOnlyTime: string): string {
  if (dateOnly) {
    const [hour = 9, minute = 0] = dateOnlyTime.split(':').map(Number);
    const total = hour * 60 + minute - minutes;
    const days = Math.floor(total / 1440);
    const clock = total - days * 1440;
    const time = `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`;
    if (days === 0) return `当天 ${time}`;
    if (days === -1) return `前一天 ${time}`;
    return `提前 ${-days} 天 ${time}`;
  }
  if (kind === 'event') return minutes === 0 ? '开始时' : `开始前 ${span(minutes)}`;
  return minutes === 0 ? '准时' : `提前 ${span(minutes)}`;
}

export function choiceValue(choice: ReminderChoiceDto): ReminderOptionValue {
  if (choice.mode === 'before') return `${choice.minutesBefore ?? 0}`;
  return choice.mode;
}

export function choiceFromValue(value: ReminderOptionValue): ReminderChoiceDto {
  if (value === 'default' || value === 'off') return { mode: value, minutesBefore: null };
  return { mode: 'before', minutesBefore: Number(value) };
}

export function sameChoice(left: ReminderChoiceDto, right: ReminderChoiceDto): boolean {
  return choiceValue(left) === choiceValue(right);
}

/** A choice the current options cannot show — 15 minutes on what became a date-only task — goes back to the default. */
export function fitChoice(choice: ReminderChoiceDto, dateOnly: boolean): ReminderChoiceDto {
  if (choice.mode !== 'before') return choice;
  const allowed: readonly number[] = dateOnly ? DATE_ONLY_REMINDER_MINUTES : TIMED_REMINDER_MINUTES;
  return allowed.includes(choice.minutesBefore ?? 0) ? choice : DEFAULT_REMINDER;
}

/** Whether a task's defaults speak for this person: it is theirs, or nobody's and they created it. */
export function isOwnTask(task: { assigneeIds: readonly string[]; createdBy: string }, userId: string): boolean {
  return task.assigneeIds.includes(userId) || (task.assigneeIds.length === 0 && task.createdBy === userId);
}

/**
 * Minutes the defaults give an item, or null for no reminder. Someone else's
 * task has none by default; an item without a time fires at the date-only
 * time, as the server schedules it.
 */
export function defaultMinutes(kind: ReminderKind, own: boolean, dateOnly: boolean, defaults: ReminderDefaults): number | null {
  const minutes = kind === 'task' ? own ? defaults.taskMinutesBefore : null : defaults.eventMinutesBefore;
  return minutes !== null && dateOnly ? 0 : minutes;
}

export function effectiveMinutes(choice: ReminderChoiceDto, kind: ReminderKind, own: boolean, dateOnly: boolean, defaults: ReminderDefaults): number | null {
  if (choice.mode === 'off') return null;
  if (choice.mode === 'before') return choice.minutesBefore ?? 0;
  return defaultMinutes(kind, own, dateOnly, defaults);
}

interface ReminderContext {
  kind: ReminderKind;
  own: boolean;
  dateOnly: boolean;
  /** Unknown until the settings load; the default then reads only as 默认. */
  defaults: ReminderDefaults | null;
}

function remindPhrase(minutes: number, context: ReminderContext, dateOnlyTime: string): string {
  if (!context.dateOnly && minutes === 0 && context.kind === 'task') return '准时提醒';
  // A clock time stands apart from the word after it: "当天 09:00 提醒".
  return `${minutesLabel(minutes, context.kind, context.dateOnly, dateOnlyTime)}${context.dateOnly ? ' ' : ''}提醒`;
}

/** The form row's summary, readable without a field name: "准时提醒（默认）", "提前 30 分钟提醒", "不提醒". */
export function reminderSummary(choice: ReminderChoiceDto, context: ReminderContext): string {
  const time = context.defaults?.dateOnlyTime ?? '09:00';
  if (choice.mode === 'off') return '不提醒';
  if (choice.mode === 'before') return remindPhrase(choice.minutesBefore ?? 0, context, time);
  if (context.defaults === null) return '默认提醒';
  const minutes = defaultMinutes(context.kind, context.own, context.dateOnly, context.defaults);
  return minutes === null ? '不提醒（默认）' : `${remindPhrase(minutes, context, time)}（默认）`;
}

/** The options of the 提醒我 step: default, off, then the times that fit the item. */
export function reminderOptions(context: ReminderContext): Array<{ value: ReminderOptionValue; label: string }> {
  const time = context.defaults?.dateOnlyTime ?? '09:00';
  const fallback = context.defaults === null ? null : defaultMinutes(context.kind, context.own, context.dateOnly, context.defaults);
  const defaultLabel = context.defaults === null ? '默认' : `默认（${fallback === null ? '不提醒' : minutesLabel(fallback, context.kind, context.dateOnly, time)}）`;
  const minutes = context.dateOnly ? DATE_ONLY_REMINDER_MINUTES : TIMED_REMINDER_MINUTES;
  return [
    { value: 'default', label: defaultLabel },
    { value: 'off', label: '不提醒' },
    ...minutes.map(value => ({ value: `${value}` as ReminderOptionValue, label: minutesLabel(value, context.kind, context.dateOnly, time) })),
  ];
}

/** When the reminder fires, on this device's clock. */
export function reminderMoment(anchor: Date, minutes: number, dateOnly: boolean, dateOnlyTime: string): Date {
  const base = dateOnly ? new Date(`${toDateValue(anchor)}T${dateOnlyTime}:00`) : anchor;
  return new Date(base.getTime() - minutes * 60_000);
}

/** The detail line: "15:15（开始前 15 分钟）", or with the date when it falls on another day. */
export function reminderDetail(anchor: Date, choice: ReminderChoiceDto, context: ReminderContext): string {
  if (context.defaults === null) return reminderSummary(choice, context);
  const minutes = effectiveMinutes(choice, context.kind, context.own, context.dateOnly, context.defaults);
  if (minutes === null) return choice.mode === 'default' ? '不提醒（默认）' : '不提醒';
  const moment = reminderMoment(anchor, minutes, context.dateOnly, context.defaults.dateOnlyTime);
  const when = toDateValue(moment) === toDateValue(anchor) ? toTimeValue(moment) : formatDateTime(moment);
  const rule = context.dateOnly
    ? minutes === 0 ? '当天' : minutes === 1440 ? '前一天' : `提前 ${span(minutes)}`
    : minutesLabel(minutes, context.kind, false, context.defaults.dateOnlyTime);
  return `${when}（${rule}）`;
}
