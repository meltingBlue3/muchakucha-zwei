import type { RecurrenceDto } from '@muchakucha/api-client';

import { i18n, useTranslation } from '../../i18n';
import { weekdayName } from '../../ui/date-values';
import { Text } from '../../ui/primitives';
import { formatLunarAnchor } from '../lunar/lunar-recurrence';

export interface FormattedRecurrenceSummary {
  summary: string;
  clampNote: string | null;
  timeZoneNote: string | null;
}

function dateParts(date: string): { month: number; day: number } {
  const [, month = '', day = ''] = date.split('-');
  return { month: Number(month), day: Number(day) };
}

function frequencySummary(rule: RecurrenceDto): string {
  const t = i18n.getFixedT(null, 'recurrence');
  const { month, day } = dateParts(rule.startsOn);
  const interval = rule.interval ?? 1;

  switch (rule.freq) {
    case 'daily':
      return t(interval > 1 ? 'dailyInterval' : 'daily', { interval });
    case 'weekly': {
      const weekdays = [...new Set(rule.byWeekday ?? [])]
        .filter((weekday) => weekday >= 0 && weekday < 7)
        // Listed from Monday, so Sunday comes last as it does in the weekday picker.
        .sort((left, right) => (left + 6) % 7 - (right + 6) % 7)
        .map(weekdayName)
        .join('、');
      if (weekdays === '') return t(interval > 1 ? 'weeklyAnyInterval' : 'weeklyAny', { interval });
      return t(interval > 1 ? 'weeklyInterval' : 'weekly', { interval, weekdays });
    }
    case 'monthly':
      return t(interval > 1 ? 'monthlyInterval' : 'monthly', { interval, day });
    case 'yearly':
      return rule.lunar === undefined
        ? t(interval > 1 ? 'yearlyInterval' : 'yearly', { interval, month, day })
        : t(interval > 1 ? 'lunarYearlyInterval' : 'lunarYearly', { interval, date: formatLunarAnchor(rule.lunar) });
    default:
      return t('repeat');
  }
}

export function formatRecurrenceSummary(
  rule: RecurrenceDto,
  deviceTimeZone: string,
): FormattedRecurrenceSummary {
  const t = i18n.getFixedT(null, 'recurrence');
  const { month, day } = dateParts(rule.startsOn);
  let summary = frequencySummary(rule);

  if (rule.endsOn !== undefined) {
    summary = t('until', { summary, end: rule.endsOn });
  } else if (rule.count !== undefined) {
    summary = t('count', { summary, count: rule.count });
  }

  return {
    summary,
    clampNote: rule.freq === 'monthly' && day >= 29
      ? t('clampMonth')
      : rule.freq === 'yearly' && rule.lunar !== undefined
        ? rule.lunar.day === 30 ? t('clampLunar') : null
        : rule.freq === 'yearly' && month === 2 && day === 29
          ? t('clampLeap')
          : null,
    timeZoneNote:
      rule.timezone === deviceTimeZone ? null : t('timeZone', { timezone: rule.timezone }),
  };
}

interface RecurrenceSummaryProps {
  rule: RecurrenceDto;
  deviceTimeZone: string;
}

/** The clamp and time-zone caveats alone, for places that already show the summary line. */
export function RecurrenceNotes({ rule, deviceTimeZone }: RecurrenceSummaryProps) {
  useTranslation('recurrence');
  const formatted = formatRecurrenceSummary(rule, deviceTimeZone);
  const notes = [formatted.clampNote, formatted.timeZoneNote].filter((note): note is string => note !== null);
  if (notes.length === 0) return null;
  return <>{notes.map(note => <Text key={note} variant="caption" color="inkMuted">{note}</Text>)}</>;
}
