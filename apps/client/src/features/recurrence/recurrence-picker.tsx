import type { RecurrenceDto, RecurrenceResponseDto } from '@muchakucha/api-client';
import { useTheme } from '@shopify/restyle';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { DateField } from '../../ui/date-field';
import { FormMessage, Stack, Text } from '../../ui/primitives';
import type { Theme } from '../../ui/theme';
import { RecurrenceSummary } from './recurrence-summary';

export type RecurrenceInput = RecurrenceDto;

type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
type EndingMode = 'forever' | 'date' | 'count';

const FREQUENCIES = [
  { value: null, label: '不重复' },
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'yearly', label: '每年' },
] as const;

const ENDINGS = [
  { value: 'forever', label: '永不结束' },
  { value: 'date', label: '截止日期' },
  { value: 'count', label: '重复次数' },
] as const;

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const;
const WEEKDAY_LABELS = WEEKDAYS.map((day) => `星期${day}`);
const COUNT_ERROR = '重复次数需要在 1 到 1000 之间。';
const DATE_REQUIRED_ERROR = '请选择重复的截止日期。';
const DATE_ORDER_ERROR = '截止日期必须晚于开始日期。';
const TIMEZONE_ERROR = '无法识别当前设备的时区。请检查系统时区设置后重试。';

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

function selectedEnding(value: RecurrenceInput | null): EndingMode {
  if (value?.endsOn !== undefined) return 'date';
  if (value?.count !== undefined) return 'count';
  return 'forever';
}

function resolveDeviceTimeZone(): string | null {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof timeZone === 'string' && timeZone.trim().length > 0 ? timeZone : null;
  } catch {
    return null;
  }
}

function weekdayFor(date: string): number {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getDay();
}

function withoutEnding(value: RecurrenceInput): RecurrenceInput {
  const next = { ...value };
  delete next.endsOn;
  delete next.count;
  return next;
}

function externalError(errors: Record<string, string>, field: string): string | undefined {
  return errors[`recurrence.${field}`] ?? errors[field];
}

interface RecurrencePickerProps {
  value: RecurrenceInput | null;
  onChange(next: RecurrenceInput | null): void;
  startDate: string;
  disabled?: boolean;
  errors?: Record<string, string>;
  onValidityChange?(valid: boolean): void;
}

export function RecurrencePicker({
  value,
  onChange,
  startDate,
  disabled = false,
  errors = {},
  onValidityChange,
}: RecurrencePickerProps) {
  const activeTheme = useTheme<Theme>();
  const deviceTimeZone = useMemo(resolveDeviceTimeZone, []);
  const [endingMode, setEndingMode] = useState<EndingMode>(() => selectedEnding(value));
  const [countText, setCountText] = useState(() => String(value?.count ?? 10));
  const [weekdayAnnouncement, setWeekdayAnnouncement] = useState(false);
  const [timeZoneUnavailable, setTimeZoneUnavailable] = useState(false);
  const countRef = useRef<TextInput>(null);
  const dateRef = useRef<View>(null);

  useEffect(() => {
    setEndingMode(selectedEnding(value));
    if (value?.count !== undefined) setCountText(String(value.count));
  }, [value?.count, value?.endsOn]);

  useEffect(() => {
    if (value === null || value.startsOn === startDate) return;
    const next = { ...value, startsOn: startDate };
    if (next.freq === 'weekly' && (next.byWeekday?.length ?? 0) === 0) {
      next.byWeekday = [weekdayFor(startDate)];
    }
    onChange(next);
  }, [onChange, startDate, value]);

  const localDateError =
    value !== null && endingMode === 'date'
      ? value.endsOn === undefined || value.endsOn === ''
        ? DATE_REQUIRED_ERROR
        : value.endsOn <= startDate
          ? DATE_ORDER_ERROR
          : undefined
      : undefined;
  const parsedCount = Number(countText);
  const localCountError =
    value !== null &&
    endingMode === 'count' &&
    (!Number.isInteger(parsedCount) || parsedCount < 1 || parsedCount > 1000)
      ? COUNT_ERROR
      : undefined;
  const dateError = externalError(errors, 'endsOn') ?? localDateError;
  const countError = externalError(errors, 'count') ?? localCountError;
  const frequencyError = externalError(errors, 'freq') ?? externalError(errors, 'startsOn');
  const timeZoneError =
    externalError(errors, 'timezone') ?? (timeZoneUnavailable ? TIMEZONE_ERROR : undefined);
  const hasExternalError = Object.keys(errors).some(
    (field) => field === 'recurrence' || field.startsWith('recurrence.'),
  );
  const valid =
    timeZoneError === undefined &&
    !hasExternalError &&
    (value === null || (dateError === undefined && countError === undefined));

  useEffect(() => {
    onValidityChange?.(valid);
  }, [onValidityChange, valid]);

  useEffect(() => {
    if (endingMode === 'count') countRef.current?.focus();
    if (endingMode === 'date') {
      (dateRef.current as unknown as { focus?: () => void } | null)?.focus?.();
    }
  }, [endingMode]);

  useEffect(() => {
    if (dateError !== undefined) {
      (dateRef.current as unknown as { focus?: () => void } | null)?.focus?.();
    } else if (countError !== undefined) {
      countRef.current?.focus();
    }
  }, [countError, dateError]);

  const chipStyle = (selected: boolean, weekday = false) => ({
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: activeTheme.controlSizes.touchTarget,
    ...(weekday
      ? { minWidth: activeTheme.spacing[10] + activeTheme.spacing[1] }
      : { paddingHorizontal: activeTheme.spacing[3] }),
    borderRadius: activeTheme.borderRadii.full,
    backgroundColor: selected ? activeTheme.colors.coral : activeTheme.colors.surfaceMuted,
    marginRight: activeTheme.spacing[2],
    marginBottom: activeTheme.spacing[2],
  });

  const chipTextColor = (selected: boolean) =>
    selected ? ('surface' as const) : ('inkMuted' as const);

  const selectFrequency = (frequency: Frequency | null) => {
    if (disabled) return;
    setWeekdayAnnouncement(false);
    if (frequency === null) {
      setEndingMode('forever');
      setTimeZoneUnavailable(false);
      onChange(null);
      return;
    }

    const timeZone = value?.timezone ?? deviceTimeZone;
    if (timeZone === null) {
      setTimeZoneUnavailable(true);
      onValidityChange?.(false);
      return;
    }
    setTimeZoneUnavailable(false);

    const base: RecurrenceInput = value ?? {
      freq: frequency,
      interval: 1,
      startsOn: startDate,
      timezone: timeZone,
    };
    const next: RecurrenceInput = {
      ...base,
      freq: frequency,
      interval: 1,
      startsOn: startDate,
      timezone: timeZone,
    };
    if (frequency === 'weekly') {
      next.byWeekday =
        base.byWeekday !== undefined && base.byWeekday.length > 0
          ? [...base.byWeekday]
          : [weekdayFor(startDate)];
    } else {
      delete next.byWeekday;
    }
    onChange(next);
  };

  const toggleWeekday = (weekday: number) => {
    if (disabled || value === null) return;
    const selected = value.byWeekday ?? [];
    if (selected.includes(weekday) && selected.length === 1) {
      setWeekdayAnnouncement(true);
      return;
    }
    setWeekdayAnnouncement(false);
    onChange({
      ...value,
      byWeekday: selected.includes(weekday)
        ? selected.filter((current) => current !== weekday)
        : [...selected, weekday].sort((left, right) => left - right),
    });
  };

  const selectEnding = (mode: EndingMode) => {
    if (disabled || value === null) return;
    setEndingMode(mode);
    const next = withoutEnding(value);
    if (mode === 'count') {
      setCountText('10');
      next.count = 10;
    }
    onChange(next);
  };

  const updateCount = (text: string) => {
    if (disabled || value === null) return;
    setCountText(text);
    const next = withoutEnding(value);
    next.count = Number(text);
    onChange(next);
  };

  return (
    <Stack gap={1}>
      <Text variant="label">重复</Text>
      <View accessibilityLabel="重复频率" accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {FREQUENCIES.map((frequency) => {
          const selected = frequency.value === null ? value === null : value?.freq === frequency.value;
          return (
            <Pressable
              key={frequency.label}
              accessibilityLabel={frequency.label}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled }}
              disabled={disabled}
              onPress={() => selectFrequency(frequency.value)}
              style={({ pressed }) => [chipStyle(selected), { opacity: pressed ? 0.7 : 1 }]}
            >
              <Text variant="bodySm" color={chipTextColor(selected)}>{frequency.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {frequencyError !== undefined && <FormMessage>{frequencyError}</FormMessage>}
      {timeZoneError !== undefined && <FormMessage>{timeZoneError}</FormMessage>}

      {value?.freq === 'weekly' && (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {WEEKDAYS.map((day, weekday) => {
              const selected = value.byWeekday?.includes(weekday) ?? false;
              return (
                <Pressable
                  key={day}
                  accessibilityLabel={WEEKDAY_LABELS[weekday]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected, disabled }}
                  disabled={disabled}
                  hitSlop={activeTheme.spacing[1]}
                  onPress={() => toggleWeekday(weekday)}
                  style={({ pressed }) => [chipStyle(selected, true), { opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text variant="bodySm" color={chipTextColor(selected)}>{day}</Text>
                </Pressable>
              );
            })}
          </View>
          {weekdayAnnouncement && (
            <Text accessibilityLiveRegion="polite" variant="caption" color="destructive">
              至少需要选择一天。
            </Text>
          )}
          {externalError(errors, 'byWeekday') !== undefined && (
            <FormMessage>{externalError(errors, 'byWeekday')}</FormMessage>
          )}
        </>
      )}

      {value !== null && (
        <>
          <Text variant="label">结束</Text>
          <View accessibilityLabel="重复结束条件" accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {ENDINGS.map((ending) => {
              const selected = endingMode === ending.value;
              return (
                <Pressable
                  key={ending.value}
                  accessibilityLabel={ending.label}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, disabled }}
                  disabled={disabled}
                  onPress={() => selectEnding(ending.value)}
                  style={({ pressed }) => [chipStyle(selected), { opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text variant="bodySm" color={chipTextColor(selected)}>{ending.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {endingMode === 'date' && (
            <Stack gap={1}>
              <View ref={dateRef} tabIndex={-1}>
                <DateField
                  accessibilityLabel="截止日期"
                  disabled={disabled}
                  label="截止日期"
                  mode="date"
                  onChange={(endsOn) => onChange({ ...withoutEnding(value), endsOn })}
                  placeholder="YYYY-MM-DD"
                  value={value.endsOn ?? ''}
                />
              </View>
              {dateError !== undefined && <FormMessage>{dateError}</FormMessage>}
            </Stack>
          )}

          {endingMode === 'count' && (
            <Stack gap={1}>
              <Text variant="label">重复次数</Text>
              <View style={{ alignItems: 'center', flexDirection: 'row', gap: activeTheme.spacing[2] }}>
                <TextInput
                  ref={countRef}
                  accessibilityLabel="重复次数"
                  accessibilityState={{ disabled }}
                  editable={!disabled}
                  keyboardType="number-pad"
                  onChangeText={updateCount}
                  placeholderTextColor={activeTheme.colors.inkMuted}
                  style={{
                    backgroundColor: activeTheme.colors.surface,
                    borderColor: activeTheme.colors.border,
                    borderRadius: activeTheme.borderRadii.sm,
                    borderWidth: activeTheme.borderWidths.default,
                    color: activeTheme.colors.ink,
                    flex: 1,
                    fontSize: activeTheme.typography.body.fontSize,
                    minHeight: activeTheme.controlSizes.field,
                    paddingHorizontal: activeTheme.spacing[4],
                    paddingVertical: activeTheme.spacing[3],
                  }}
                  value={countText}
                />
                <Text variant="body">次</Text>
              </View>
              {countError !== undefined && <FormMessage>{countError}</FormMessage>}
            </Stack>
          )}

          <RecurrenceSummary rule={value} deviceTimeZone={deviceTimeZone ?? value.timezone} />
        </>
      )}
    </Stack>
  );
}
