import type { RecurrenceErrorKey } from './recurrence-options';
import { useTranslation } from '../../i18n';
import type { RecurrenceDto } from '@muchakucha/api-client';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { OptionRow, ROW_CONTENT_INSET, SummaryRow } from '../../ui/compose-rows';
import { DateField } from '../../ui/date-field';
import { PickerActions } from '../../ui/picker-panels';
import { FormMessage, Inline, Stack, Text } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import { formatDate, parseDateValue, weekdayName } from '../../ui/date-values';
import { useWindowStep, type RouteWindowStep } from '../../ui/window-step';
import {
  MAX_INTERVAL,
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
import { formatLunarAnchor, lunarAnchorFor } from '../lunar/lunar-recurrence';

const UNITS = ['daily', 'weekly', 'monthly', 'yearly'] as const satisfies readonly Frequency[];
// Monday first, as in Google Calendar for zh-CN; values stay 0 = Sunday.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

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
  errors?: Record<string, RecurrenceErrorKey>;
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
export function RecurrenceField({ value, onChange, startDate: formStart, name, icon, disabled = false, disableTurnOff = false, turnOffHint, errors = {}, ownStart = false }: RecurrenceFieldProps) {
  const { t } = useTranslation('recurrence');
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
  const summary = value ? formatRecurrenceSummary(value, value.timezone).summary : t('preset.none');
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
        title: t('repeat'),
        onClose: close,
        onReturn,
        content: <OptionList preset={preset} summary={summary} startDate={startDate} disableTurnOff={disableTurnOff} turnOffHint={turnOffHint} timeZoneError={timeZoneError} onChoose={choose} onCustom={openCustom} />,
      };
    }
    if (stage === 'custom') {
      return {
        title: t('field.custom'),
        onClose: close,
        onReturn,
        content: <CustomEditor draft={draft} errors={draftErrors} timeZoneError={timeZoneError} startDate={ownStart ? draft.startsOn : startDate} ownStart={ownStart} onChange={next => { setDraft(next); setDraftErrors({}); }} onCancel={close} onDone={finishCustom} />,
      };
    }
    return null;
  }, [choose, close, disableTurnOff, turnOffHint, draft, draftErrors, finishCustom, openCustom, ownStart, preset, stage, startDate, summary, timeZoneError, t]);
  const inWindow = useWindowStep(step);

  const serverErrors = [...new Set(Object.entries(errors).filter(([field]) => field === 'recurrence' || field.startsWith('recurrence.')).map(([, message]) => message))];

  return (
    <Stack gap={0}>
      <SummaryRow name={name} summary={summary} icon={icon} open={stage !== 'closed'} disabled={disabled} trigger={trigger} onPress={() => setStage(current => current === 'closed' ? 'options' : 'closed')} />
      {ownStart && value ? <View style={{ paddingLeft: ROW_CONTENT_INSET }}><Text variant="caption">{value.startTimeLocal
        ? t('field.startWithTime', { date: formatDate(parseDateValue(value.startsOn)), time: value.startTimeLocal })
        : t('field.start', { date: formatDate(parseDateValue(value.startsOn)) })}</Text></View> : null}
      {value ? <View style={{ paddingLeft: ROW_CONTENT_INSET }}><RecurrenceNotes rule={value} deviceTimeZone={deviceTimeZone() ?? value.timezone} /></View> : null}
      {!inWindow && step ? <View style={{ paddingLeft: ROW_CONTENT_INSET, paddingBottom: theme.spacing[3] }}>{step.content}</View> : null}
      {serverErrors.map(message => <View key={message} style={{ paddingLeft: ROW_CONTENT_INSET }}><FormMessage>{t(`validation.${message}`)}</FormMessage></View>)}
    </Stack>
  );
}

function OptionList({ preset, summary, startDate, disableTurnOff, turnOffHint, timeZoneError, onChoose, onCustom }: {
  preset: ReturnType<typeof presetOf>;
  summary: string;
  startDate: string;
  disableTurnOff: boolean;
  turnOffHint?: string | undefined;
  timeZoneError: boolean;
  onChoose(preset: Exclude<ReturnType<typeof presetOf>, 'custom'>): void;
  onCustom(): void;
}) {
  const { t } = useTranslation('recurrence');
  return (
    <Stack gap={2}>
      <View accessibilityRole="radiogroup" accessibilityLabel={t('field.frequency')}>
        {PRESET_OPTIONS.map(presetValue => {
          // The lunar 每年 names the lunar date the start date falls on, and is missing outside the lunar table.
          const anchor = presetValue === 'lunarYearly' ? lunarAnchorFor(startDate) : null;
          if (presetValue === 'lunarYearly' && anchor === null) return null;
          const label = anchor === null ? t(`preset.${presetValue}`) : t('preset.lunarYearly', { date: formatLunarAnchor(anchor) });
          return <OptionRow key={presetValue} label={label} checked={preset === presetValue} disabled={presetValue === 'none' && disableTurnOff} onPress={() => onChoose(presetValue)} />;
        })}
        <OptionRow label={t('preset.custom')} {...(preset === 'custom' ? { detail: summary } : {})} checked={preset === 'custom'} onPress={onCustom} />
      </View>
      {disableTurnOff ? <Text variant="caption">{turnOffHint ?? t('field.turnOffHint')}</Text> : null}
      {timeZoneError ? <FormMessage>{t('validation.timeZone')}</FormMessage> : null}
    </Stack>
  );
}

function Choice({ label, text = label, selected, onPress, role = 'radio', circle = false, fill = false }: { label: string; text?: string; selected: boolean; onPress(): void; role?: 'radio' | 'checkbox'; circle?: boolean; /** Shares its row's width with its siblings instead of keeping its own. */ fill?: boolean }) {
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
          : { minHeight: theme.controlSizes.touchTarget - theme.spacing[1], minWidth: theme.controlSizes.touchTarget, paddingHorizontal: theme.spacing[3] }), borderRadius: theme.borderRadii.full, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? theme.colors.primary : pressed ? theme.colors.surfaceMuted : theme.colors.surfaceSubtle, borderWidth: theme.borderWidths.default, borderColor: selected ? theme.colors.primary : theme.colors.outline })}
    >
      <Text variant="bodySm" color={selected ? 'surface' : 'ink'}>{text}</Text>
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

/** 公历 or 农历 for a yearly rule, and the date it then repeats on. */
function YearlyCalendar({ draft, startDate, month, day, onChange }: { draft: CustomDraft; startDate: string; month: number; day: number; onChange(lunar: boolean): void }) {
  const { t } = useTranslation('recurrence');
  const anchor = lunarAnchorFor(startDate);
  const lunar = draft.lunar && anchor !== null;
  return (
    <Stack gap={2}>
      {anchor !== null ? (
        <View accessibilityRole="radiogroup" accessibilityLabel={t('field.calendar')} style={{ flexDirection: 'row', gap: theme.spacing[1] }}>
          <Choice label={t('field.solar')} selected={!lunar} onPress={() => onChange(false)} />
          <Choice label={t('field.lunar')} selected={lunar} onPress={() => onChange(true)} />
        </View>
      ) : null}
      <Text variant="bodySm">{lunar ? t('field.lunarYearly', { date: formatLunarAnchor(anchor) }) : t('field.solarYearly', { month, day })}</Text>
    </Stack>
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
  const { t } = useTranslation(['recurrence', 'common', 'events']);
  const [, month = '', day = ''] = startDate.split('-');
  const every = t('field.every');
  const countBefore = t('field.countBefore');
  const set = (patch: Partial<CustomDraft>) => onChange({ ...draft, ...patch });
  const setEnding = (ending: CustomEnding) => set({ ending });
  const toggleDay = (weekday: number) => set({
    byWeekday: draft.byWeekday.includes(weekday) ? draft.byWeekday.filter(current => current !== weekday) : [...draft.byWeekday, weekday],
  });
  return (
    <Stack gap={4}>
      <Stack gap={2}>
        <Text variant="label">{t('field.interval')}</Text>
        {/* One line: the units share what 每 and the count leave. */}
        <Inline gap={2}>
          {every ? <Text>{every}</Text> : null}
          <NumberInput label={t('field.interval')} value={draft.intervalText} onChange={intervalText => set({ intervalText })} />
          <View accessibilityRole="radiogroup" accessibilityLabel={t('field.unit')} style={{ flex: 1, flexDirection: 'row', gap: theme.spacing[1] }}>
            {UNITS.map(unit => <Choice key={unit} label={t(`field.units.${unit}`)} selected={draft.freq === unit} onPress={() => set({ freq: unit })} fill />)}
          </View>
        </Inline>
        {errors.interval ? <FormMessage>{t(errors.interval, { max: MAX_INTERVAL })}</FormMessage> : null}
      </Stack>

      {draft.freq === 'weekly' ? (
        <Stack gap={2}>
          <Text variant="label">{t('field.days')}</Text>
          {/* One row of equal circles, like Google Calendar's weekday picker. */}
          <View style={{ flexDirection: 'row', gap: theme.spacing[1] }}>
            {WEEK_ORDER.map(weekday => <View key={weekday} style={{ flex: 1, alignItems: 'center' }}>
              <Choice role="checkbox" label={t('field.weekday', { name: weekdayName(weekday) })} text={weekdayName(weekday)} selected={draft.byWeekday.includes(weekday)} onPress={() => toggleDay(weekday)} circle />
            </View>)}
          </View>
          {errors.byWeekday ? <FormMessage>{t(errors.byWeekday)}</FormMessage> : null}
        </Stack>
      ) : draft.freq === 'monthly' ? (
        <Text variant="bodySm">{t(Number(day) >= 29 ? 'field.monthlyClamped' : 'field.monthly', { day: Number(day) })}</Text>
      ) : draft.freq === 'yearly' ? (
        <YearlyCalendar draft={draft} startDate={startDate} month={Number(month)} day={Number(day)} onChange={lunar => set({ lunar })} />
      ) : null}

      {ownStart ? <>
        <Stack gap={2}>
          <Text variant="label">{t('rule.time')}</Text>
          <Inline gap={2}>
            <View style={{ flex: 1 }}>
              <DateField value={draft.startTime} onChange={startTime => set({ startTime })} mode="time" placeholder={t('field.setTime')} pickerDefault="09:00" accessibilityLabel={t('field.time')} />
            </View>
            {draft.startTime !== '' ? (
              <Pressable accessibilityRole="button" accessibilityLabel={t('field.clearTime')} onPress={() => set({ startTime: '' })} style={({ pressed }) => ({ minHeight: theme.controlSizes.touchTarget, justifyContent: 'center', paddingHorizontal: theme.spacing[2], opacity: pressed ? 0.6 : 1 })}>
                <Text variant="label" color="link">{t('common:clear')}</Text>
              </Pressable>
            ) : null}
          </Inline>
        </Stack>
        <Stack gap={2}>
          <Text variant="label">{t('events:startDate')}</Text>
          <DateField value={draft.startsOn} onChange={startsOn => { if (startsOn !== '') onChange(moveDraftStart(draft, startsOn)); }} mode="date" accessibilityLabel={t('field.startDate')} />
        </Stack>
      </> : null}

      <Stack gap={1}>
        <Text variant="label">{t('field.end')}</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('field.endCondition')}>
          <OptionRow label={t('field.never')} checked={draft.ending === 'never'} onPress={() => setEnding('never')} />
          <OptionRow label={t('field.endDate')} checked={draft.ending === 'date'} onPress={() => setEnding('date')} />
          {draft.ending === 'date' ? (
            <View style={{ paddingLeft: theme.controlSizes.icon + theme.spacing[6] }}>
              <DateField value={draft.endsOn} onChange={endsOn => set({ endsOn })} mode="date" placeholder={t('field.chooseEndDate')} pickerDefault={startDate} accessibilityLabel={t('field.repeatEndDate')} />
              {errors.endsOn ? <FormMessage>{t(errors.endsOn)}</FormMessage> : null}
            </View>
          ) : null}
          <OptionRow label={t('field.count')} checked={draft.ending === 'count'} onPress={() => setEnding('count')} />
          {draft.ending === 'count' ? (
            <View style={{ paddingLeft: theme.controlSizes.icon + theme.spacing[6] }}>
              <Inline gap={2}>
                {countBefore ? <Text>{countBefore}</Text> : null}
                <NumberInput label={t('field.countValue')} value={draft.countText} onChange={countText => set({ countText })} />
                <Text>{t('field.countAfter')}</Text>
              </Inline>
              {errors.count ? <FormMessage>{t(errors.count)}</FormMessage> : null}
            </View>
          ) : null}
        </View>
      </Stack>
      {timeZoneError ? <FormMessage>{t('validation.timeZone')}</FormMessage> : null}
      <PickerActions onCancel={onCancel} onConfirm={onDone} confirmLabel={t('common:done')} />
    </Stack>
  );
}
