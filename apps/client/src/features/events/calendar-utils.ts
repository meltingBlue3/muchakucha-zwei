/** Pure date helpers for the calendar month grid. No React dependency. */

import { formatDate } from '../../ui/date-values';

const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'] as const;

export interface CalendarDay {
  date: Date;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  iso: string; // YYYY-MM-DD
}

export interface CalendarMonth {
  year: number;
  month: number; // 0-indexed
  weeks: CalendarDay[][];
}

export function getDayNames(): readonly string[] {
  return DAY_NAMES;
}

export function getCalendarMonth(year: number, month: number): CalendarMonth {
  const today = new Date();
  const todayIso = toDateIso(today);

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Start from the Sunday of the week containing the 1st
  const start = new Date(firstDay);
  start.setDate(start.getDate() - start.getDay());

  // End on the Saturday of the week containing the last day
  const end = new Date(lastDay);
  end.setDate(end.getDate() + (6 - end.getDay()));

  const weeks: CalendarDay[][] = [];
  let current = new Date(start);
  let week: CalendarDay[] = [];

  while (current <= end) {
    const iso = toDateIso(current);
    week.push({
      date: new Date(current),
      dayOfMonth: current.getDate(),
      isCurrentMonth: current.getMonth() === month,
      isToday: iso === todayIso,
      iso,
    });

    if (current.getDay() === 6) {
      weeks.push(week);
      week = [];
    }

    current.setDate(current.getDate() + 1);
  }

  // Push final partial week if exists
  if (week.length > 0) weeks.push(week);

  return { year, month, weeks };
}

export function toDateIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toDateRangeIso(year: number, month: number): { start: string; end: string } {
  const start = toDateIso(new Date(year, month, 1));
  const end = toDateIso(new Date(year, month + 1, 0));
  return { start, end };
}

export function formatMonthLabel(year: number, month: number): string {
  return `${year}年${month + 1}月`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * "6月20日 09:00 – 10:00", "6月20日 全天", or both dates when the event
 * spans days, so a multi-day timed event never shows only its start date.
 */
export function formatDateRange(startIso: string, endIso: string, allDay: boolean, options: { weekday?: boolean } = {}): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const startDate = formatDate(start, options);
  const sameDay = toDateIso(start) === toDateIso(end);
  if (allDay) return sameDay ? `${startDate} 全天` : `${startDate} – ${formatDate(end, options)} 全天`;
  return sameDay
    ? `${startDate} ${formatTime(startIso)} – ${formatTime(endIso)}`
    : `${startDate} ${formatTime(startIso)} – ${formatDate(end, options)} ${formatTime(endIso)}`;
}

export function today(): Date {
  return new Date();
}
