/** Local "YYYY-MM-DD" / "HH:mm" values shared by the date and time pickers. */

const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'] as const;

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

/** "2026-09-27" → "2026年9月27日周日"; other values pass through unchanged. */
export function formatDateLabel(value: string): string {
  if (!isDateValue(value)) return value;
  const date = parseDateValue(value);
  return `${formatDayLabel(date)}周${WEEKDAY_NAMES[date.getDay()]}`;
}

/** "2026年9月27日" */
export function formatDayLabel(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/**
 * The date shown in lists, details and messages: "9月27日", or "2027年1月3日"
 * outside the current year, optionally followed by the weekday ("9月27日周日").
 * Pickers keep the full year through `formatDateLabel`, since there the user
 * is choosing an exact date.
 */
export function formatDate(date: Date, { weekday = false }: { weekday?: boolean } = {}, now: Date = new Date()): string {
  const year = date.getFullYear() === now.getFullYear() ? '' : `${date.getFullYear()}年`;
  return `${year}${date.getMonth() + 1}月${date.getDate()}日${weekday ? `周${WEEKDAY_NAMES[date.getDay()]}` : ''}`;
}

/** "周日" */
export function formatWeekday(date: Date): string {
  return `周${WEEKDAY_NAMES[date.getDay()]}`;
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
