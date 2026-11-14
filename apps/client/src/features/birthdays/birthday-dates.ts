import type { CreateEventDto, EventResponseDto, RecurrenceResponseDto, ReminderChoiceDto } from '@muchakucha/api-client';
import { formatLunarDate, formatLunarMonthDay, fromLunar, toLunar } from '@muchakucha/lunar';

import { currentLanguage } from '../../i18n';
import { solarDateOf } from '../lunar/lunar-calendar';
import { nextLunarDate } from '../lunar/lunar-recurrence';

export type BirthdayCalendar = 'solar' | 'lunar';

/** What the add-birthday form holds; numbers stay text while typing. */
export interface BirthdayDraft {
  name: string;
  calendar: BirthdayCalendar;
  /** 0 until chosen. */
  month: number;
  day: number;
  birthYearText: string;
  /** Also keep the birthday of the other calendar, worked out from the year of birth. */
  alsoOther: boolean;
}

export const EMPTY_BIRTHDAY: BirthdayDraft = { name: '', calendar: 'lunar', month: 0, day: 0, birthYearText: '', alsoOther: false };

export const BIRTH_YEAR_MIN = 1900;
export const NAME_MAX = 40;

export type BirthdayErrors = Partial<Record<'name' | 'date' | 'birthYear', string>>;

const pad = (value: number) => String(value).padStart(2, '0');
const isoOf = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;
const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** Days a Gregorian month can have in some year, so 2 月 offers 29. */
export function solarMonthDays(month: number): number {
  return month === 2 ? 29 : new Date(Date.UTC(2000, month, 0)).getUTCDate();
}

/** 3月2日 or 农历十月十五. */
export function formatBirthdayDate(calendar: BirthdayCalendar, month: number, day: number): string {
  return calendar === 'lunar' ? formatLunarDate(month, day, false, currentLanguage()) : `${month}月${day}日`;
}

export function birthYearOf(draft: BirthdayDraft): number | null {
  if (!/^\d{4}$/.test(draft.birthYearText)) return null;
  return Number(draft.birthYearText);
}

export function validateBirthday(draft: BirthdayDraft, todayIso: string): BirthdayErrors {
  const errors: BirthdayErrors = {};
  if (draft.name.trim() === '') errors.name = '请填写是谁的生日。';
  if (draft.month === 0 || draft.day === 0) errors.date = '请选择生日的日期。';
  if (draft.birthYearText !== '') {
    const year = birthYearOf(draft);
    if (year === null || year < BIRTH_YEAR_MIN || year > Number(todayIso.slice(0, 4))) errors.birthYear = `出生年份需要在 ${BIRTH_YEAR_MIN} 到今年之间。`;
  }
  return errors;
}

/** The first Gregorian birthday on or after `fromIso`; 2 月 29 日 falls on 28 日 in a common year. */
export function nextSolarBirthday(month: number, day: number, fromIso: string): string {
  const year = Number(fromIso.slice(0, 4));
  for (const candidateYear of [year, year + 1]) {
    const candidate = isoOf(candidateYear, month, month === 2 && day === 29 && !isLeapYear(candidateYear) ? 28 : day);
    if (candidate >= fromIso) return candidate;
  }
  return isoOf(year + 1, month, day);
}

/**
 * Where a Gregorian birthday series starts. A yearly series repeats its start
 * date's month and day, so 2 月 29 日 starts on the last 29 February to keep
 * landing on 28 February in common years.
 */
function solarSeriesStart(month: number, day: number, todayIso: string): string {
  if (month !== 2 || day !== 29) return nextSolarBirthday(month, day, todayIso);
  let year = Number(todayIso.slice(0, 4));
  while (!isLeapYear(year) || isoOf(year, 2, 29) > todayIso) year -= 1;
  return isoOf(year, 2, 29);
}

/** The next date of a birthday on or after today. */
export function nextBirthday(calendar: BirthdayCalendar, month: number, day: number, todayIso: string): string | null {
  return calendar === 'lunar' ? nextLunarDate(todayIso, { month, day }) : nextSolarBirthday(month, day, todayIso);
}

/** The same birth date in the other calendar, worked out from the year of birth. */
export interface OtherBirthday {
  calendar: BirthdayCalendar;
  month: number;
  day: number;
  /** The year of birth in that calendar: a 腊月 birthday is lunar 1968 and Gregorian 1969. */
  year: number;
  /** 公历 1968年12月4日 or 农历戊申年十月十五, to check against an ID card or a family record. */
  birthDate: string;
}

export function otherBirthday(draft: BirthdayDraft): OtherBirthday | null {
  const year = birthYearOf(draft);
  if (year === null || draft.month === 0 || draft.day === 0) return null;
  if (draft.calendar === 'lunar') {
    const solar = fromLunar({ year, month: draft.month, day: draft.day, leap: false });
    if (solar === null) return null;
    return { calendar: 'solar', month: solar.month, day: solar.day, year: solar.year, birthDate: `公历 ${solar.year}年${solar.month}月${solar.day}日` };
  }
  if (draft.day > new Date(Date.UTC(year, draft.month, 0)).getUTCDate()) return null;
  const lunar = toLunar(solarDateOf(isoOf(year, draft.month, draft.day)));
  if (lunar === null) return null;
  // Someone born in a leap month keeps the ordinary month's date each year.
  return { calendar: 'lunar', month: lunar.month, day: lunar.day, year: lunar.year, birthDate: `农历 ${lunar.year}年${formatLunarMonthDay(lunar.month, lunar.day, lunar.leap)}` };
}

/** Age at a birthday on `dateIso`, counting lunar years for a lunar birthday; null without a year of birth. */
export function ageOn(recurrence: Pick<RecurrenceResponseDto, 'occasion' | 'birthYear' | 'lunar'> | null | undefined, dateIso: string): number | null {
  if (recurrence?.occasion !== 'birthday' || recurrence.birthYear == null) return null;
  const year = recurrence.lunar ? toLunar(solarDateOf(dateIso))?.year : Number(dateIso.slice(0, 4));
  if (year === undefined) return null;
  const age = year - recurrence.birthYear;
  return age >= 0 ? age : null;
}

/** 十月十五 for a lunar birthday, 11月18日 for a Gregorian one. */
export function birthdayDateOf(recurrence: Pick<RecurrenceResponseDto, 'lunar' | 'startsOn'>): string {
  if (recurrence.lunar) return formatLunarDate(recurrence.lunar.month, recurrence.lunar.day, false, currentLanguage());
  return `${Number(recurrence.startsOn.slice(5, 7))}月${Number(recurrence.startsOn.slice(8, 10))}日`;
}

/** 农历十月十五 · 58 岁 on an occurrence of a birthday series; null for any other event. */
export function birthdayNote(event: Pick<EventResponseDto, 'recurrence' | 'occurrenceDate'>): string | null {
  const recurrence = event.recurrence;
  if (recurrence?.occasion !== 'birthday') return null;
  const age = event.occurrenceDate ? ageOn(recurrence, event.occurrenceDate) : null;
  const parts = [recurrence.lunar ? birthdayDateOf(recurrence) : null, age === null ? null : `${age} 岁`].filter((part): part is string => part !== null);
  return parts.length ? parts.join(' · ') : null;
}

function titleFor(name: string, calendar: BirthdayCalendar): string {
  return `${name.trim()}的${calendar === 'lunar' ? '农历' : ''}生日`;
}

function eventFor(name: string, calendar: BirthdayCalendar, month: number, day: number, birthYear: number | null, todayIso: string, timezone: string, myReminder: ReminderChoiceDto | undefined): CreateEventDto | null {
  const startsOn = calendar === 'lunar' ? nextLunarDate(todayIso, { month, day }) : solarSeriesStart(month, day, todayIso);
  if (startsOn === null) return null;
  // An all-day event, as the event form sends one: local midnight to the end of the day.
  const start = new Date(`${startsOn}T00:00:00`);
  const end = new Date(`${startsOn}T23:59:59`);
  return {
    title: titleFor(name, calendar),
    allDay: true,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    recurrence: {
      freq: 'yearly',
      startsOn,
      timezone,
      ...(calendar === 'lunar' ? { lunar: { month, day } } : {}),
      occasion: 'birthday',
      ...(birthYear === null ? {} : { birthYear }),
    },
    ...(myReminder === undefined ? {} : { myReminder }),
  };
}

/**
 * The series a saved form creates: the chosen birthday, and the other
 * calendar's when asked for and the year of birth makes it known. For the
 * other calendar the year of birth is its own: a 腊月 birthday is lunar 1968
 * and Gregorian 1969.
 */
export function birthdayEvents(draft: BirthdayDraft, todayIso: string, timezone: string, myReminder?: ReminderChoiceDto): CreateEventDto[] {
  const birthYear = birthYearOf(draft);
  const first = eventFor(draft.name, draft.calendar, draft.month, draft.day, birthYear, todayIso, timezone, myReminder);
  const other = draft.alsoOther ? otherBirthday(draft) : null;
  const second = other === null ? null : eventFor(draft.name, other.calendar, other.month, other.day, other.year, todayIso, timezone, myReminder);
  return [first, second].filter((event): event is CreateEventDto => event !== null);
}
