import { BadRequestException } from '@nestjs/common';
import type { RecurrenceDto, RecurrenceOccasion } from './dto/recurrence.dto.js';

/** The rule columns a recurrence request sets besides its frequency and bounds. */
export interface SeriesMarks {
  lunarMonth: number | null;
  lunarDay: number | null;
  occasion: RecurrenceOccasion | null;
  birthYear: number | null;
}

type MarkedRule = { lunarMonth: number | null; lunarDay: number | null; occasion: string | null; birthYear: number | null };

function invalid(field: string, code: string, message: string): never {
  throw new BadRequestException({
    code: 'VALIDATION_FAILED',
    message: 'Request validation failed.',
    details: [{ field, codes: [code], message }],
  });
}

/**
 * Resolves the marks a created or successor rule stores. The lunar anchor is
 * part of how the rule repeats, so a request without one repeats on Gregorian
 * dates. Occasion and birth year describe the series instead: an edit that
 * omits them keeps the previous rule's, and null clears them.
 */
export function resolveSeriesMarks(
  recurrence: Pick<RecurrenceDto, 'freq' | 'lunar' | 'occasion' | 'birthYear'>,
  previous: Pick<MarkedRule, 'occasion' | 'birthYear'> | null,
): SeriesMarks {
  const occasion = recurrence.occasion === undefined
    ? (previous?.occasion as RecurrenceOccasion | null | undefined) ?? null
    : recurrence.occasion;
  const birthYear = recurrence.birthYear === undefined ? previous?.birthYear ?? null : recurrence.birthYear;
  if (recurrence.lunar !== undefined && recurrence.freq !== 'yearly') {
    invalid('recurrence.lunar', 'lunar_requires_yearly', '按农历重复只能是每年。');
  }
  if (occasion !== null && recurrence.freq !== 'yearly') {
    invalid('recurrence.occasion', 'occasion_requires_yearly', '生日只能每年重复。');
  }
  if (birthYear !== null && occasion !== 'birthday') {
    invalid('recurrence.birthYear', 'birth_year_requires_birthday', '只有生日可以填写出生年份。');
  }
  return {
    lunarMonth: recurrence.lunar?.month ?? null,
    lunarDay: recurrence.lunar?.day ?? null,
    occasion,
    birthYear,
  };
}

/** The marks of a stored rule in response form. */
export function seriesMarksResponse(rule: MarkedRule): {
  lunar: { month: number; day: number } | null;
  occasion: RecurrenceOccasion | null;
  birthYear: number | null;
} {
  return {
    lunar: rule.lunarMonth === null || rule.lunarDay === null ? null : { month: rule.lunarMonth, day: rule.lunarDay },
    occasion: rule.occasion === 'birthday' ? 'birthday' : null,
    birthYear: rule.birthYear,
  };
}
