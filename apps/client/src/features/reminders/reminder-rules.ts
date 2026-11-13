import { i18n } from '../../i18n';
import type { ReminderChoiceDto, ReminderSettingsDto } from '@muchakucha/api-client';
import { formatDateTime, toDateValue, toTimeValue } from '../../ui/date-values';

export type ReminderKind = 'task' | 'event';
export type ReminderDefaults = Pick<ReminderSettingsDto, 'taskMinutesBefore' | 'eventMinutesBefore' | 'dateOnlyTime' | 'alarm'>;

export const DEFAULT_REMINDER: ReminderChoiceDto = { mode: 'default', minutesBefore: null, alarm: null };

/** What a reminder can be set to. Minutes count back from the due or start time, or from the date-only time on that day. */
export const TIMED_REMINDER_MINUTES = [0, 5, 15, 30, 60, 1440] as const;
export const DATE_ONLY_REMINDER_MINUTES = [0, 1440] as const;

/** A choice as an option value: 'default', 'off' or the minutes before. */
export type ReminderOptionValue = 'default' | 'off' | `${number}`;

/** Whether it rings, as an option value: follow the default, ring like an alarm clock, or only notify. */
export type AlarmOptionValue = 'default' | 'on' | 'off';

function span(minutes: number): string {
  if (minutes % 1440 === 0) return i18n.t('reminders:days', { count: minutes / 1440 });
  if (minutes % 60 === 0) return i18n.t('reminders:hours', { count: minutes / 60 });
  return i18n.t('reminders:minutes', { count: minutes });
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
    if (days === 0) return i18n.t('reminders:sameDayTime', { time });
    if (days === -1) return i18n.t('reminders:priorDayTime', { time });
    return i18n.t('reminders:daysBeforeTime', { count: -days, time });
  }
  if (kind === 'event') return minutes === 0 ? i18n.t('reminders:eventStart') : i18n.t('reminders:eventBefore', { duration: span(minutes) });
  return minutes === 0 ? i18n.t('reminders:taskDue') : i18n.t('reminders:before', { duration: span(minutes) });
}

export function choiceValue(choice: ReminderChoiceDto): ReminderOptionValue {
  if (choice.mode === 'before') return `${choice.minutesBefore ?? 0}`;
  return choice.mode;
}

export function alarmValue(choice: ReminderChoiceDto): AlarmOptionValue {
  if (choice.alarm === true) return 'on';
  return choice.alarm === false ? 'off' : 'default';
}

/** No reminder has nothing to ring, so 不提醒 drops the alarm choice, as the server does. */
export function choiceFromValue(value: ReminderOptionValue, alarm: AlarmOptionValue = 'default'): ReminderChoiceDto {
  if (value === 'off') return { mode: 'off', minutesBefore: null, alarm: null };
  const rings = alarm === 'default' ? null : alarm === 'on';
  if (value === 'default') return { mode: 'default', minutesBefore: null, alarm: rings };
  return { mode: 'before', minutesBefore: Number(value), alarm: rings };
}

export function sameChoice(left: ReminderChoiceDto, right: ReminderChoiceDto): boolean {
  return choiceValue(left) === choiceValue(right) && alarmValue(left) === alarmValue(right);
}

/** A choice the current options cannot show — 15 minutes on what became a date-only task — goes back to the default time. */
export function fitChoice(choice: ReminderChoiceDto, dateOnly: boolean): ReminderChoiceDto {
  if (choice.mode !== 'before') return choice;
  const allowed: readonly number[] = dateOnly ? DATE_ONLY_REMINDER_MINUTES : TIMED_REMINDER_MINUTES;
  return allowed.includes(choice.minutesBefore ?? 0) ? choice : { ...DEFAULT_REMINDER, alarm: choice.alarm ?? null };
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
  if (!context.dateOnly && minutes === 0 && context.kind === 'task') return i18n.t('reminders:onTimeReminder');
  // A clock time stands apart from the word after it: "当天 09:00 提醒".
  return i18n.t(context.dateOnly ? 'reminders:dateReminder' : 'reminders:timedReminder', { when: minutesLabel(minutes, context.kind, context.dateOnly, dateOnlyTime) });
}

/** The form row's summary, readable without a field name: "准时提醒（默认）", "提前 30 分钟提醒", "不提醒". */
export function reminderSummary(choice: ReminderChoiceDto, context: ReminderContext): string {
  const time = context.defaults?.dateOnlyTime ?? '09:00';
  if (choice.mode === 'off') return i18n.t('reminders:off');
  if (choice.mode === 'before') return remindPhrase(choice.minutesBefore ?? 0, context, time);
  if (context.defaults === null) return i18n.t('reminders:defaultReminder');
  const minutes = defaultMinutes(context.kind, context.own, context.dateOnly, context.defaults);
  return minutes === null ? i18n.t('reminders:withDefault', { value: i18n.t('reminders:off') }) : i18n.t('reminders:withDefault', { value: remindPhrase(minutes, context, time) });
}

/** The options of the 提醒我 step: default, off, then the times that fit the item. */
export function reminderOptions(context: ReminderContext): Array<{ value: ReminderOptionValue; label: string }> {
  const time = context.defaults?.dateOnlyTime ?? '09:00';
  const fallback = context.defaults === null ? null : defaultMinutes(context.kind, context.own, context.dateOnly, context.defaults);
  const defaultLabel = context.defaults === null ? i18n.t('reminders:default') : i18n.t('reminders:defaultWith', { value: fallback === null ? i18n.t('reminders:off') : minutesLabel(fallback, context.kind, context.dateOnly, time) });
  const minutes = context.dateOnly ? DATE_ONLY_REMINDER_MINUTES : TIMED_REMINDER_MINUTES;
  return [
    { value: 'default', label: defaultLabel },
    { value: 'off', label: i18n.t('reminders:off') },
    ...minutes.map(value => ({ value: `${value}` as ReminderOptionValue, label: minutesLabel(value, context.kind, context.dateOnly, time) })),
  ];
}

export function effectiveAlarm(choice: ReminderChoiceDto, defaults: Pick<ReminderDefaults, 'alarm'>): boolean {
  return choice.alarm ?? defaults.alarm;
}

function alarmLabel(rings: boolean): string {
  return rings ? i18n.t('reminders:alarmOn') : i18n.t('reminders:alarmOff');
}

/** The 闹铃 row's summary, readable without a field name: "闹铃提醒（默认）", "普通提醒". */
export function alarmSummary(choice: ReminderChoiceDto, defaults: Pick<ReminderDefaults, 'alarm'> | null): string {
  if (choice.alarm !== null && choice.alarm !== undefined) return alarmLabel(choice.alarm);
  return defaults === null ? i18n.t('reminders:defaultDelivery') : i18n.t('reminders:withDefault', { value: alarmLabel(defaults.alarm) });
}

/** The options of the 闹铃 step: default, then ringing or only notifying. */
export function alarmOptions(defaults: Pick<ReminderDefaults, 'alarm'> | null): Array<{ value: AlarmOptionValue; label: string; detail?: string }> {
  return [
    { value: 'default', label: defaults === null ? i18n.t('reminders:default') : i18n.t('reminders:defaultWith', { value: alarmLabel(defaults.alarm) }) },
    { value: 'on', label: alarmLabel(true), detail: i18n.t('reminders:alarmDetail') },
    { value: 'off', label: alarmLabel(false), detail: i18n.t('reminders:notificationDetail') },
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
  if (minutes === null) return choice.mode === 'default' ? i18n.t('reminders:withDefault', { value: i18n.t('reminders:off') }) : i18n.t('reminders:off');
  const moment = reminderMoment(anchor, minutes, context.dateOnly, context.defaults.dateOnlyTime);
  const when = toDateValue(moment) === toDateValue(anchor) ? toTimeValue(moment) : formatDateTime(moment);
  const rule = context.dateOnly
    ? minutes === 0 ? i18n.t('reminders:sameDay') : minutes === 1440 ? i18n.t('reminders:priorDay') : i18n.t('reminders:before', { duration: span(minutes) })
    : minutesLabel(minutes, context.kind, false, context.defaults.dateOnlyTime);
  const detail = i18n.t('reminders:detailTime', { when, rule });
  return effectiveAlarm(choice, context.defaults) ? i18n.t('reminders:detailAlarm', { detail }) : detail;
}
