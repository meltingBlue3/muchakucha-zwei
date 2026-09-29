import type { RecurrenceDto } from '@muchakucha/api-client';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { OptionRow, ROW_CONTENT_INSET, SummaryRow } from '../../ui/compose-rows';
import { DateField } from '../../ui/date-field';
import { PickerActions } from '../../ui/picker-panels';
import { FormMessage, Inline, Stack, Text } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import { formatDate } from '../../ui/date-values';
import { useWindowStep, type RouteWindowStep } from '../../ui/window-step';
import {
  PRESET_OPTIONS,
  deviceTimeZone,
  draftFromRule,
  followStartDate,
  moveDraftStart,
  presetOf,
  presetRule,
  ruleFromDraft,
  validateDraft,
  withDraftStart,
  type CustomDraft,
  type CustomEnding,
  type CustomErrors,
  type Frequency,
} from './recurrence-options';
import { RecurrenceNotes, formatRecurrenceSummary } from './recurrence-summary';

const TIMEZONE_ERROR = '无法识别当前设备的时区。请检查系统时区设置后重试。';
const TURN_OFF_DISABLED_HINT = '如需彻底停止这个重复，请到规则详情页使用「结束此重复」。';
const UNITS: ReadonlyArray<{ value: Frequency; label: string }> = [
  { value: 'daily', label: '天' },
  { value: 'weekly', label: '周' },
  { value: 'monthly', label: '个月' },
  { value: 'yearly', label: '年' },
];
// Monday first, as in Google Calendar for zh-CN; values stay 0 = Sunday.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const DAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'] as const;

interface RecurrenceFieldProps {
  value: RecurrenceDto | null;
  onChange(next: RecurrenceDto | null): void;
  startDate: string;
  /** Accessible name of the row, followed by the current summary. */
  name: string;
  icon?: ReactNode;
  disabled?: boolean;
  /** An occurrence of an existing series cannot be detached here (CR-03). */
  disableTurnOff?: boolean;
  /** Explains where to stop the series instead; shown with a disabled 不重复. */
  turnOffHint?: string;
  /** Server validation messages keyed by `recurrence.<field>`. */
  errors?: Record<string, string>;
  /**
   * The rule owns its start date and time, set on the custom page as in
   * Google Calendar. A new recurring task has no other start to follow;
   * `startDate` is then only the default.
   */
  ownStart?: boolean;
}

type Stage = 'closed' | 'options' | 'custom';

/**
 * Google Calendar's repeat control: one summary row that opens a single-choice
 * list (不重复, 每天, 每周, 每月, 每年, 自定义…), and a custom page for
 * intervals, weekdays and an end condition.
 */
export function RecurrenceField({ value, onChange, startDate: formStart, name, icon, disabled = false, disableTurnOff = false, turnOffHint = TURN_OFF_DISABLED_HINT, errors = {}, ownStart = false }: RecurrenceFieldProps) {
  // Where the rule is anchored: its own start when it owns one, else the form's.
  const startDate = ownStart && value ? value.startsOn : formStart;
  const [stage, setStage] = useState<Stage>('closed');
  const [draft, setDraft] = useState<CustomDraft>(() => draftFromRule(value, startDate));
  const [draftErrors, setDraftErrors] = useState<CustomErrors>({});
  const [timeZoneError, setTimeZoneError] = useState(false);
  const trigger = useRef<View>(null);

  // Only a start date the user changes while the field is open moves a
  // weekly rule's weekday; the initial sync (for example a rule anchored to
  // tomorrow) keeps the weekdays it already has.
  const previousStart = useRef(startDate);
  useEffect(() => {
    const moved = previousStart.current !== startDate;
    previousStart.current = startDate;
    if (value === null || ownStart) return;
    const next = followStartDate(value, startDate, moved);
    if (next !== value) onChange(next);
  }, [onChange, ownStart, startDate, value]);

  const preset = presetOf(value, startDate);
  const summary = value ? formatRecurrenceSummary(value, value.timezone).summary : '不重复';
  const close = useCallback(() => { setStage('closed'); setTimeZoneError(false); }, []);
  const timezone = useCallback(() => {
    const zone = value?.timezone ?? deviceTimeZone();
    if (zone === null) setTimeZoneError(true);
    return zone;
  }, [value]);

  const choose = useCallback((next: Exclude<typeof preset, 'custom'>) => {
    if (next === 'none') {
      if (disableTurnOff) return;
      onChange(null);
      close();
      return;
    }
    const zone = timezone();
    if (zone === null) return;
    onChange(presetRule(next, startDate, zone, value));
    close();
  }, [close, disableTurnOff, onChange, startDate, timezone, value]);

  const openCustom = useCallback(() => {
    setDraft(draftFromRule(value, startDate));
    setDraftErrors({});
    setStage('custom');
  }, [startDate, value]);

  const finishCustom = useCallback(() => {
    const found = validateDraft(draft, ownStart ? draft.startsOn : startDate);
    setDraftErrors(found);
    if (Object.keys(found).length > 0) return;
    const zone = timezone();
    if (zone === null) return;
    const rule = ruleFromDraft(draft, ownStart ? draft.startsOn : startDate, zone, value);
    onChange(ownStart ? withDraftStart(rule, draft) : rule);
    close();
  }, [close, draft, onChange, ownStart, startDate, timezone, value]);

  const step = useMemo<RouteWindowStep | null>(() => {
    const onReturn = () => (trigger.current as unknown as { focus?(): void } | null)?.focus?.();
    if (stage === 'options') {
      return {
        title: '重复',
        onClose: close,
        onReturn,
        content: <OptionList preset={preset} summary={summary} disableTurnOff={disableTurnOff} turnOffHint={turnOffHint} timeZoneError={timeZoneError} onChoose={choose} onCustom={openCustom} />,
      };
    }
    if (stage === 'custom') {
      return {
        title: '自定义重复',
        onClose: close,
        onReturn,
        content: <CustomEditor draft={draft} errors={draftErrors} timeZoneError={timeZoneError} startDate={ownStart ? draft.startsOn : startDate} ownStart={ownStart} onChange={next => { setDraft(next); setDraftErrors({}); }} onCancel={close} onDone={finishCustom} />,
      };
    }
    return null;
  }, [choose, close, disableTurnOff, turnOffHint, draft, draftErrors, finishCustom, openCustom, ownStart, preset, stage, startDate, summary, timeZoneError]);
  const inWindow = useWindowStep(step);

  const serverErrors = [...new Set(Object.entries(errors).filter(([field]) => field === 'recurrence' || field.startsWith('recurrence.')).map(([, message]) => message))];

  return (
    <Stack gap={0}>
      <SummaryRow name={name} summary={summary} icon={icon} open={stage !== 'closed'} disabled={disabled} trigger={trigger} onPress={() => setStage(current => current === 'closed' ? 'options' : 'closed')} />
      {ownStart && value ? <View style={{ paddingLeft: ROW_CONTENT_INSET }}><Text variant="caption">{`从${formatDate(new Date(`${value.startsOn}T00:00:00`))}开始${value.startTimeLocal ? `，每次 ${value.startTimeLocal}` : ''}`}</Text></View> : null}
      {value ? <View style={{ paddingLeft: ROW_CONTENT_INSET }}><RecurrenceNotes rule={value} deviceTimeZone={deviceTimeZone() ?? value.timezone} /></View> : null}
      {!inWindow && step ? <View style={{ paddingLeft: ROW_CONTENT_INSET, paddingBottom: theme.spacing[3] }}>{step.content}</View> : null}
      {serverErrors.map(message => <View key={message} style={{ paddingLeft: ROW_CONTENT_INSET }}><FormMessage>{message}</FormMessage></View>)}
    </Stack>
  );
}

function OptionList({ preset, summary, disableTurnOff, turnOffHint, timeZoneError, onChoose, onCustom }: {
  preset: ReturnType<typeof presetOf>;
  summary: string;
  disableTurnOff: boolean;
  turnOffHint: string;
  timeZoneError: boolean;
  onChoose(preset: Exclude<ReturnType<typeof presetOf>, 'custom'>): void;
  onCustom(): void;
}) {
  return (
    <Stack gap={2}>
      <View accessibilityRole="radiogroup" accessibilityLabel="重复频率">
        {PRESET_OPTIONS.map(option => (
          <OptionRow key={option.value} label={option.label} checked={preset === option.value} disabled={option.value === 'none' && disableTurnOff} onPress={() => onChoose(option.value)} />
        ))}
        <OptionRow label="自定义…" {...(preset === 'custom' ? { detail: summary } : {})} checked={preset === 'custom'} onPress={onCustom} />
      </View>
      {disableTurnOff ? <Text variant="caption">{turnOffHint}</Text> : null}
      {timeZoneError ? <FormMessage>{TIMEZONE_ERROR}</FormMessage> : null}
    </Stack>
  );
}

function Choice({ label, selected, onPress, role = 'radio', circle = false, fill = false }: { label: string; selected: boolean; onPress(): void; role?: 'radio' | 'checkbox'; circle?: boolean; /** Shares its row's width with its siblings instead of keeping its own. */ fill?: boolean }) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      onPress={onPress}
      style={({ pressed }) => ({ ...(circle
        ? { width: '100%', maxWidth: theme.controlSizes.touchTarget - theme.spacing[1], aspectRatio: 1 }
        : fill
          ? { flex: 1, minHeight: theme.controlSizes.touchTarget - theme.spacing[1], paddingHorizontal: theme.spacing[1] }
          : { minHeight: theme.controlSizes.touchTarget - theme.spacing[1], minWidth: theme.controlSizes.touchTarget, paddingHorizontal: theme.spacing[3] }), borderRadius: theme.borderRadii.full, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? theme.colors.coral : pressed ? theme.colors.surfaceMuted : theme.colors.surfaceSubtle, borderWidth: theme.borderWidths.default, borderColor: selected ? theme.colors.coral : theme.colors.separator })}
    >
      <Text variant="bodySm" color={selected ? 'surface' : 'ink'}>{label.startsWith('星期') ? label.slice(2) : label}</Text>
    </Pressable>
  );
}

function NumberInput({ value, onChange, label }: { value: string; onChange(value: string): void; label: string }) {
  return (
    <TextInput
      value={value}
      onChangeText={text => onChange(text.replace(/[^0-9]/g, ''))}
      keyboardType="number-pad"
      maxLength={4}
      selectTextOnFocus
      accessibilityLabel={label}
      style={{ width: theme.spacing[12], minHeight: theme.controlSizes.touchTarget - theme.spacing[1], textAlign: 'center', borderBottomWidth: theme.borderWidths.focus, borderBottomColor: theme.colors.border, fontSize: theme.typography.body.fontSize, fontFamily: theme.fontFamilies.regular, color: theme.colors.ink }}
    />
  );
}

function CustomEditor({ draft, errors, timeZoneError, startDate, ownStart, onChange, onCancel, onDone }: {
  draft: CustomDraft;
  errors: CustomErrors;
  timeZoneError: boolean;
  startDate: string;
  ownStart: boolean;
  onChange(next: CustomDraft): void;
  onCancel(): void;
  onDone(): void;
}) {
  const [, month = '', day = ''] = startDate.split('-');
  const set = (patch: Partial<CustomDraft>) => onChange({ ...draft, ...patch });
  const setEnding = (ending: CustomEnding) => set({ ending });
  const toggleDay = (weekday: number) => set({
    byWeekday: draft.byWeekday.includes(weekday) ? draft.byWeekday.filter(current => current !== weekday) : [...draft.byWeekday, weekday],
  });
  return (
    <Stack gap={4}>
      <Stack gap={2}>
        <Text variant="label">重复间隔</Text>
        {/* One line: the units share what 每 and the count leave. */}
        <Inline gap={2}>
          <Text>每</Text>
          <NumberInput label="重复间隔" value={draft.intervalText} onChange={intervalText => set({ intervalText })} />
          <View accessibilityRole="radiogroup" accessibilityLabel="重复单位" style={{ flex: 1, flexDirection: 'row', gap: theme.spacing[1] }}>
            {UNITS.map(unit => <Choice key={unit.value} label={unit.label} selected={draft.freq === unit.value} onPress={() => set({ freq: unit.value })} fill />)}
          </View>
        </Inline>
        {errors.interval ? <FormMessage>{errors.interval}</FormMessage> : null}
      </Stack>

      {draft.freq === 'weekly' ? (
        <Stack gap={2}>
          <Text variant="label">重复日期</Text>
          {/* One row of equal circles, like Google Calendar's weekday picker. */}
          <View style={{ flexDirection: 'row', gap: theme.spacing[1] }}>
            {WEEK_ORDER.map(weekday => <View key={weekday} style={{ flex: 1, alignItems: 'center' }}>
              <Choice role="checkbox" label={`星期${DAY_NAMES[weekday]}`} selected={draft.byWeekday.includes(weekday)} onPress={() => toggleDay(weekday)} circle />
            </View>)}
          </View>
          {errors.byWeekday ? <FormMessage>{errors.byWeekday}</FormMessage> : null}
        </Stack>
      ) : draft.freq === 'monthly' ? (
        <Text variant="bodySm">{`在每月的第 ${Number(day)} 天重复${Number(day) >= 29 ? '；有些月份没有这一天，会自动改到当月最后一天。' : ''}`}</Text>
      ) : draft.freq === 'yearly' ? (
        <Text variant="bodySm">{`在每年的 ${Number(month)} 月 ${Number(day)} 日重复`}</Text>
      ) : null}

      {ownStart ? <>
        <Stack gap={2}>
          <Text variant="label">时间</Text>
          <Inline gap={2}>
            <View style={{ flex: 1 }}>
              <DateField value={draft.startTime} onChange={startTime => set({ startTime })} mode="time" placeholder="设置时间" pickerDefault="09:00" accessibilityLabel="重复时间" />
            </View>
            {draft.startTime !== '' ? (
              <Pressable accessibilityRole="button" accessibilityLabel="清除重复时间" onPress={() => set({ startTime: '' })} style={({ pressed }) => ({ minHeight: theme.controlSizes.touchTarget, justifyContent: 'center', paddingHorizontal: theme.spacing[2], opacity: pressed ? 0.6 : 1 })}>
                <Text variant="label" color="link">清除</Text>
              </Pressable>
            ) : null}
          </Inline>
        </Stack>
        <Stack gap={2}>
          <Text variant="label">开始日期</Text>
          <DateField value={draft.startsOn} onChange={startsOn => { if (startsOn !== '') onChange(moveDraftStart(draft, startsOn)); }} mode="date" accessibilityLabel="重复开始日期" />
        </Stack>
      </> : null}

      <Stack gap={1}>
        <Text variant="label">结束</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="重复结束条件">
          <OptionRow label="永不" checked={draft.ending === 'never'} onPress={() => setEnding('never')} />
          <OptionRow label="截止日期" checked={draft.ending === 'date'} onPress={() => setEnding('date')} />
          {draft.ending === 'date' ? (
            <View style={{ paddingLeft: theme.controlSizes.icon + theme.spacing[6] }}>
              <DateField value={draft.endsOn} onChange={endsOn => set({ endsOn })} mode="date" placeholder="选择截止日期" pickerDefault={startDate} accessibilityLabel="重复截止日期" />
              {errors.endsOn ? <FormMessage>{errors.endsOn}</FormMessage> : null}
            </View>
          ) : null}
          <OptionRow label="重复次数" checked={draft.ending === 'count'} onPress={() => setEnding('count')} />
          {draft.ending === 'count' ? (
            <View style={{ paddingLeft: theme.controlSizes.icon + theme.spacing[6] }}>
              <Inline gap={2}>
                <Text>发生</Text>
                <NumberInput label="重复次数值" value={draft.countText} onChange={countText => set({ countText })} />
                <Text>次后结束</Text>
              </Inline>
              {errors.count ? <FormMessage>{errors.count}</FormMessage> : null}
            </View>
          ) : null}
        </View>
      </Stack>
      {timeZoneError ? <FormMessage>{TIMEZONE_ERROR}</FormMessage> : null}
      <PickerActions onCancel={onCancel} onConfirm={onDone} confirmLabel="完成" />
    </Stack>
  );
}
