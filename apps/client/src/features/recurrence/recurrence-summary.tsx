import type { RecurrenceDto } from '@muchakucha/api-client';
import { useTheme } from '@shopify/restyle';
import { View } from 'react-native';

import { Text } from '../../ui/primitives';
import type { Theme } from '../../ui/theme';

const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'] as const;
const CLAMP_NOTE = '有些月份没有这一天，会自动改到当月最后一天。';

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
  const { month, day } = dateParts(rule.startsOn);

  switch (rule.freq) {
    case 'daily':
      return '每天重复';
    case 'weekly': {
      const weekdays = [...new Set(rule.byWeekday ?? [])]
        .filter((weekday) => weekday >= 0 && weekday < DAY_NAMES.length)
        .sort((left, right) => left - right)
        .map((weekday) => DAY_NAMES[weekday]);
      return `每周${weekdays.join('、')}重复`;
    }
    case 'monthly':
      return `每月 ${day} 日重复`;
    case 'yearly':
      return `每年 ${month} 月 ${day} 日重复`;
    default:
      return '重复';
  }
}

export function formatRecurrenceSummary(
  rule: RecurrenceDto,
  deviceTimeZone: string,
): FormattedRecurrenceSummary {
  const { day } = dateParts(rule.startsOn);
  let summary = frequencySummary(rule);

  if (rule.endsOn !== undefined) {
    summary += `，到 ${rule.endsOn} 为止`;
  } else if (rule.count !== undefined) {
    summary += `，共 ${rule.count} 次`;
  }

  return {
    summary,
    clampNote: rule.freq === 'monthly' && day >= 29 ? CLAMP_NOTE : null,
    timeZoneNote:
      rule.timezone === deviceTimeZone ? null : `按 ${rule.timezone} 的日期重复。`,
  };
}

interface RecurrenceSummaryProps {
  rule: RecurrenceDto;
  deviceTimeZone: string;
}

export function RecurrenceSummary({ rule, deviceTimeZone }: RecurrenceSummaryProps) {
  const activeTheme = useTheme<Theme>();
  const formatted = formatRecurrenceSummary(rule, deviceTimeZone);

  return (
    <View
      style={{
        backgroundColor: activeTheme.colors.tealSoft,
        borderRadius: activeTheme.borderRadii.sm,
        padding: activeTheme.spacing[3],
      }}
    >
      <Text
        variant="caption"
        color="teal"
        numberOfLines={2}
        accessibilityLabel={formatted.summary}
      >
        {formatted.summary}
      </Text>
      {formatted.clampNote !== null && (
        <Text variant="caption" color="inkMuted">
          {formatted.clampNote}
        </Text>
      )}
      {formatted.timeZoneNote !== null && (
        <Text variant="caption" color="inkMuted">
          {formatted.timeZoneNote}
        </Text>
      )}
    </View>
  );
}
