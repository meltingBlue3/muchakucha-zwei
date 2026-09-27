import type { RecurrenceDto, RecurrenceResponseDto } from '@muchakucha/api-client';

/** The recurrence payload a form submits. */
export type RecurrenceInput = RecurrenceDto;

const COUNT_ERROR = '重复次数需要在 1 到 1000 之间。';
const DATE_REQUIRED_ERROR = '请选择重复的截止日期。';
const TIMEZONE_ERROR = '无法识别当前设备的时区。请检查系统时区设置后重试。';


/** Google Calendar's repeat menu: fixed presets plus 自定义…. */
export type RecurrencePreset = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
const FREQUENCIES: readonly string[] = ['daily', 'weekly', 'monthly', 'yearly'];

export const PRESET_OPTIONS: ReadonlyArray<{ value: Exclude<RecurrencePreset, 'custom'>; label: string }> = [
  { value: 'none', label: '不重复' },
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'yearly', label: '每年' },
];

export const MAX_INTERVAL = 52;
export const MAX_COUNT = 1000;

export function weekdayOf(date: string): number {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getDay();
}

function hasEnding(rule: RecurrenceDto): boolean {
  return rule.endsOn !== undefined || rule.count !== undefined;
}

/** Which menu entry describes `rule`; anything a preset cannot express is custom. */
export function presetOf(rule: RecurrenceDto | null, startDate: string): RecurrencePreset {
  if (rule === null) return 'none';
  if ((rule.interval ?? 1) !== 1 || hasEnding(rule)) return 'custom';
  if (rule.freq === 'weekly') {
    const days = rule.byWeekday ?? [];
    return days.length === 1 && days[0] === weekdayOf(startDate) ? 'weekly' : 'custom';
  }
  return FREQUENCIES.includes(rule.freq) ? rule.freq as Frequency : 'custom';
}

/** A fresh preset rule, keeping server-owned fields (series time and duration) from `previous`. */
export function presetRule(
  preset: Frequency,
  startDate: string,
  timezone: string,
  previous: RecurrenceDto | null,
): RecurrenceDto {
  const next: RecurrenceDto = { ...(previous ?? {}), freq: preset, interval: 1, startsOn: startDate, timezone };
  delete next.endsOn;
  delete next.count;
  if (preset === 'weekly') next.byWeekday = [weekdayOf(startDate)];
  else delete next.byWeekday;
  return next;
}

/**
 * Keeps a rule anchored to the start date. When the user moves the start
 * date (`moveWeekday`), a weekly rule that only repeats on the old start
 * weekday moves with it, as Google Calendar does. Anchoring an existing rule
 * to a new split date keeps its weekdays.
 */
export function followStartDate(rule: RecurrenceDto, startDate: string, moveWeekday = true): RecurrenceDto {
  if (startDate === '' || rule.startsOn === startDate) return rule;
  const next: RecurrenceDto = { ...rule, startsOn: startDate };
  const days = rule.byWeekday ?? [];
  if (rule.freq === 'weekly' && (days.length === 0 || (moveWeekday && days.length === 1 && days[0] === weekdayOf(rule.startsOn)))) {
    next.byWeekday = [weekdayOf(startDate)];
  }
  return next;
}

export type CustomEnding = 'never' | 'date' | 'count';

/** Editable form of a custom rule; text fields stay strings while typing. */
export interface CustomDraft {
  freq: Frequency;
  intervalText: string;
  byWeekday: number[];
  ending: CustomEnding;
  endsOn: string;
  countText: string;
}

export function draftFromRule(rule: RecurrenceDto | null, startDate: string): CustomDraft {
  const freq = rule && FREQUENCIES.includes(rule.freq) ? rule.freq as Frequency : 'weekly';
  return {
    freq,
    intervalText: String(rule?.interval ?? 1),
    byWeekday: rule?.byWeekday?.length ? [...rule.byWeekday] : [weekdayOf(startDate)],
    ending: rule?.endsOn !== undefined ? 'date' : rule?.count !== undefined ? 'count' : 'never',
    endsOn: rule?.endsOn ?? '',
    countText: String(rule?.count ?? 13),
  };
}

export type CustomErrors = Partial<Record<'interval' | 'byWeekday' | 'endsOn' | 'count', string>>;

export function validateDraft(draft: CustomDraft, startDate: string): CustomErrors {
  const errors: CustomErrors = {};
  const interval = Number(draft.intervalText);
  if (!Number.isInteger(interval) || interval < 1 || interval > MAX_INTERVAL) errors.interval = `间隔需要在 1 到 ${MAX_INTERVAL} 之间。`;
  if (draft.freq === 'weekly' && draft.byWeekday.length === 0) errors.byWeekday = '至少需要选择一天。';
  if (draft.ending === 'date') {
    if (draft.endsOn === '') errors.endsOn = '请选择重复的截止日期。';
    else if (draft.endsOn <= startDate) errors.endsOn = '截止日期必须晚于开始日期。';
  }
  if (draft.ending === 'count') {
    const count = Number(draft.countText);
    if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) errors.count = `重复次数需要在 1 到 ${MAX_COUNT} 之间。`;
  }
  return errors;
}

export function ruleFromDraft(draft: CustomDraft, startDate: string, timezone: string, previous: RecurrenceDto | null): RecurrenceDto {
  const next: RecurrenceDto = { ...(previous ?? {}), freq: draft.freq, interval: Number(draft.intervalText), startsOn: startDate, timezone };
  delete next.endsOn;
  delete next.count;
  delete next.byWeekday;
  if (draft.freq === 'weekly') next.byWeekday = [...new Set(draft.byWeekday)].sort((a, b) => a - b);
  if (draft.ending === 'date') next.endsOn = draft.endsOn;
  if (draft.ending === 'count') next.count = Number(draft.countText);
  return next;
}

export function deviceTimeZone(): string | null {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof timeZone === 'string' && timeZone.trim().length > 0 ? timeZone : null;
  } catch {
    return null;
  }
}

export function recurrenceInputFromResponse(
  response: RecurrenceResponseDto | null | undefined,
): RecurrenceInput | null {
  if (response === null || response === undefined) return null;
  return {
    freq: response.freq,
    interval: response.interval,
    byWeekday: [...response.byWeekday],
    startsOn: response.startsOn,
    timezone: response.timezone,
    ...(response.endsOn === null || response.endsOn === undefined
      ? {}
      : { endsOn: response.endsOn }),
    ...(response.count === null || response.count === undefined ? {} : { count: response.count }),
    ...(response.startTimeLocal === null || response.startTimeLocal === undefined
      ? {}
      : { startTimeLocal: response.startTimeLocal }),
    ...(response.durationMinutes === null || response.durationMinutes === undefined
      ? {}
      : { durationMinutes: response.durationMinutes }),
  };
}

export function recurrenceErrorsFromApi(error: unknown): Record<string, string> {
  if (typeof error !== 'object' || error === null || !('body' in error)) return {};
  const body = (error as { body?: unknown }).body;
  if (typeof body !== 'object' || body === null || !('error' in body)) return {};
  const apiError = (body as { error?: { code?: string; details?: unknown } }).error;
  if (apiError?.code !== 'VALIDATION_FAILED' || !Array.isArray(apiError.details)) return {};

  const messages: Record<string, string> = {};
  for (const detail of apiError.details) {
    if (typeof detail !== 'object' || detail === null || !('field' in detail)) continue;
    const field = (detail as { field?: unknown }).field;
    if (typeof field !== 'string' || !field.startsWith('recurrence.')) continue;
    const leaf = field.slice('recurrence.'.length);
    messages[field] =
      leaf === 'endsOn'
        ? DATE_REQUIRED_ERROR
        : leaf === 'count'
          ? COUNT_ERROR
          : leaf === 'timezone'
            ? TIMEZONE_ERROR
            : leaf === 'byWeekday'
              ? '至少需要选择一天。'
              : '重复规则没有保存成功。请检查网络后重试。';
  }
  return messages;
}
