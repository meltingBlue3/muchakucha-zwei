/**
 * Local "YYYY-MM-DD" / "HH:mm" values shared by the date and time pickers, and
 * dates as people read them. The read forms follow the interface language, so
 * a component that shows one takes `useTranslation` to re-render on a switch.
 */

import { i18n } from '../i18n';

/** Catalog keys of the weekdays, indexed as `Date.getDay()` counts them. */
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/** 「日」 for a Sunday, in the interface language. */
function weekdayName(day: number): string {
  return i18n.t(`dates:weekdayNames.${WEEKDAYS[day] ?? 'sun'}`);
}

/** Weeks start on Monday everywhere: the calendar, its week view, the date picker and weekly repeats. */
export function weekHeader(): readonly string[] {
  return [1, 2, 3, 4, 5, 6, 0].map(weekdayName);
}

/** Days since the Monday that starts this date's week (Monday 0 … Sunday 6). */
export function daysSinceMonday(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function isDateValue(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y!, m! - 1, d!);
  return date.getFullYear() === y && date.getMonth() === m! - 1 && date.getDate() === d;
}

export function isTimeValue(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Parses a date value into a local Date, falling back to today. */
export function parseDateValue(value: string): Date {
  if (!isDateValue(value)) return new Date();
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

/** Parses a time value onto today's date, falling back to now. */
export function parseTimeValue(value: string): Date {
  const date = new Date();
  if (!isTimeValue(value)) return date;
  const [h, minute] = value.split(':').map(Number);
  date.setHours(h!, minute!, 0, 0);
  return date;
}

export function toDateValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function toTimeValue(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** "2026-09-27" → "2026年9月27日周日" (日本語では "2026年9月27日(日)"); other values pass through unchanged. */
export function formatDateLabel(value: string): string {
  if (!isDateValue(value)) return value;
  const date = parseDateValue(value);
  return i18n.t('dates:withWeekday', { date: formatDayLabel(date), name: weekdayName(date.getDay()) });
}

/** "2026年9月27日" */
export function formatDayLabel(date: Date): string {
  return i18n.t('dates:full', { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() });
}

/**
 * The date shown in lists, details and messages: "9月27日", or "2027年1月3日"
 * outside the current year, optionally followed by the weekday ("9月27日周日").
 * Pickers keep the full year through `formatDateLabel`, since there the user
 * is choosing an exact date.
 */
export function formatDate(date: Date, { weekday = false }: { weekday?: boolean } = {}, now: Date = new Date()): string {
  const text = date.getFullYear() === now.getFullYear()
    ? i18n.t('dates:monthDay', { month: date.getMonth() + 1, day: date.getDate() })
    : formatDayLabel(date);
  return weekday ? i18n.t('dates:withWeekday', { date: text, name: weekdayName(date.getDay()) }) : text;
}

/** "周日" (日本語では "日曜日") */
export function formatWeekday(date: Date): string {
  return i18n.t('dates:weekday', { name: weekdayName(date.getDay()) });
}

/** "9月27日 14:30", following `formatDate`. */
export function formatDateTime(date: Date, options: { weekday?: boolean } = {}, now: Date = new Date()): string {
  return `${formatDate(date, options, now)} ${toTimeValue(date)}`;
}

/** Normalizes loose keyboard input such as "2026/9/7" or "2026-9-7"; null when it is not a real date. */
export function normalizeDateInput(text: string): string | null {
  const match = /^\s*(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?\s*$/.exec(text);
  if (!match) return null;
  const value = `${match[1]}-${match[2]!.padStart(2, '0')}-${match[3]!.padStart(2, '0')}`;
  return isDateValue(value) ? value : null;
}

/** Normalizes loose keyboard input such as "9:5", "0905" or "9点"; null when it is not a valid time. */
export function normalizeTimeInput(text: string): string | null {
  const trimmed = text.trim();
  const match = /^(\d{1,2})(?:\s*[:：点.]\s*(\d{1,2})?\s*分?)?$/.exec(trimmed) ?? /^(\d{2})(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const value = `${match[1]!.padStart(2, '0')}:${(match[2] ?? '0').padStart(2, '0')}`;
  return isTimeValue(value) ? value : null;
}
