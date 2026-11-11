import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { Pressable, Switch, TextInput, View } from 'react-native';
import Cake from 'lucide-react-native/icons/cake';
import CalendarDays from 'lucide-react-native/icons/calendar-days';
import CalendarPlus from 'lucide-react-native/icons/calendar-plus';
import Hash from 'lucide-react-native/icons/hash';
import { useTheme } from '@shopify/restyle';
import type { CreateEventDto } from '@muchakucha/api-client';

import { DraftNotice } from '../../ui/draft-notice';
import { FilterOptions } from '../../ui/filter-options';
import { FormRow, FormSection, RowMessage, ROW_CONTENT_INSET, SummaryRow, rowIcon, useComposeInputStyles } from '../../ui/compose-rows';
import { formatDate } from '../../ui/date-values';
import { FormActions, Stack, Text } from '../../ui/primitives';
import type { Theme } from '../../ui/theme';
import { useDesktopDensity } from '../../ui/use-desktop';
import { useWindowStep, type RouteWindowStep } from '../../ui/window-step';
import { useWorkspaceState } from '../../ui/workspace-state';
import { focusFieldOnOpen } from '../../platform/keyboard/focus-on-open';
import { deviceTimeZone } from '../recurrence/recurrence-options';
import { ReminderField } from '../reminders/reminder-field';
import { alarmValue, choiceFromValue, choiceValue, DEFAULT_REMINDER, fitChoice, sameChoice, type AlarmOptionValue, type ReminderOptionValue } from '../reminders/reminder-rules';
import {
  ageOn,
  birthYearOf,
  birthdayEvents,
  EMPTY_BIRTHDAY,
  formatBirthdayDate,
  nextBirthday,
  NAME_MAX,
  otherBirthday,
  validateBirthday,
  type BirthdayCalendar,
  type BirthdayDraft,
  type BirthdayErrors,
} from './birthday-dates';
import { MonthDayPicker } from './month-day-picker';

const CALENDARS: Array<{ value: BirthdayCalendar; label: string; name: string }> = [
  { value: 'lunar', label: '农历', name: '按农历过生日' },
  { value: 'solar', label: '公历', name: '按公历过生日' },
];

/** 农历十月十五：11月23日周一 · 58 岁, the next time a birthday comes round. */
function nextLine(calendar: BirthdayCalendar, month: number, day: number, birthYear: number | null, todayIso: string): string | null {
  const next = nextBirthday(calendar, month, day, todayIso);
  if (next === null) return null;
  const date = formatDate(new Date(`${next}T12:00:00`), { weekday: true });
  const age = ageOn({ occasion: 'birthday', birthYear, lunar: calendar === 'lunar' ? { month, day } : null }, next);
  // A Gregorian date would only repeat itself, so that line names the calendar instead.
  return `${calendar === 'lunar' ? formatBirthdayDate(calendar, month, day) : '公历生日'}：${date}${age === null ? '' : ` · ${age} 岁`}`;
}

/**
 * 添加生日: whose birthday, lunar or Gregorian, its month and day, and an
 * optional year of birth. With the year known, the other calendar's birthday
 * can be kept as well, so one entry gives a person both.
 */
export function BirthdayForm({ draftKey, people, todayIso, submitting, onSubmit, onCancel }: {
  draftKey: string;
  /** Names offered as one tap: 我 and the household's members. */
  people: string[];
  todayIso: string;
  submitting: boolean;
  onSubmit(events: CreateEventDto[]): void;
  onCancel(): void;
}) {
  const activeTheme = useTheme<Theme>();
  const inputs = useComposeInputStyles();
  const dense = useDesktopDensity();
  const [draft, setDraft] = useWorkspaceState<BirthdayDraft>(`${draftKey}:birthday`, EMPTY_BIRTHDAY);
  const [reminder, setReminder] = useWorkspaceState<ReminderOptionValue>(`${draftKey}:reminder`, () => choiceValue(DEFAULT_REMINDER));
  const [alarm, setAlarm] = useWorkspaceState<AlarmOptionValue>(`${draftKey}:alarm`, () => alarmValue(DEFAULT_REMINDER));
  const [errors, setErrors] = useState<BirthdayErrors>({});
  const [picking, setPicking] = useState(false);
  const [timeZoneError, setTimeZoneError] = useState(false);
  const dateTrigger = useRef<View>(null);
  const nameErrorId = useId();
  const yearErrorId = useId();

  const update = useCallback((patch: Partial<BirthdayDraft>) => {
    setDraft(current => ({ ...current, ...patch }));
    setErrors(current => {
      const next = { ...current };
      if ('name' in patch) delete next.name;
      if ('month' in patch || 'day' in patch) delete next.date;
      if ('birthYearText' in patch) delete next.birthYear;
      return next;
    });
  }, [setDraft]);

  const chooseCalendar = (value: string) => {
    // A month and day mean something else in the other calendar, so they are chosen again.
    if (value !== draft.calendar) update({ calendar: value as BirthdayCalendar, month: 0, day: 0, alsoOther: false });
  };

  const step = useMemo<RouteWindowStep | null>(() => picking ? {
    title: draft.calendar === 'lunar' ? '农历生日' : '公历生日',
    onClose: () => setPicking(false),
    onReturn: () => (dateTrigger.current as unknown as { focus?(): void } | null)?.focus?.(),
    content: <MonthDayPicker calendar={draft.calendar} month={draft.month} day={draft.day} onCancel={() => setPicking(false)} onDone={(month, day) => { update({ month, day }); setPicking(false); }} />,
  } : null, [draft.calendar, draft.day, draft.month, picking, update]);
  const inWindow = useWindowStep(step);

  const birthYear = birthYearOf(draft);
  const other = otherBirthday(draft);
  const chosen = draft.month !== 0 && draft.day !== 0;
  const preview = [
    chosen ? nextLine(draft.calendar, draft.month, draft.day, birthYear, todayIso) : null,
    draft.alsoOther && other !== null ? nextLine(other.calendar, other.month, other.day, other.year, todayIso) : null,
  ].filter((line): line is string => line !== null);

  const submit = () => {
    const found = validateBirthday(draft, todayIso);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const timezone = deviceTimeZone();
    setTimeZoneError(timezone === null);
    if (timezone === null) return;
    const choice = fitChoice(choiceFromValue(reminder, alarm), true);
    onSubmit(birthdayEvents(draft, todayIso, timezone, sameChoice(choice, DEFAULT_REMINDER) ? undefined : choice));
  };

  const textSize = dense ? 'bodySm' : 'body';
  // Content under an icon row starts where that row's text does; a phone also indents rows without an icon.
  const contentInset = dense ? activeTheme.layout.desktopControl + activeTheme.spacing[2] : ROW_CONTENT_INSET;
  return (
    <Stack gap={0}>
      <DraftNotice />
      <FormRow>
        <TextInput
          autoFocus={focusFieldOnOpen}
          editable={!submitting}
          value={draft.name}
          onChangeText={name => update({ name })}
          placeholder="谁的生日"
          placeholderTextColor={activeTheme.colors.inkMuted}
          style={inputs.title}
          maxLength={NAME_MAX}
          accessibilityLabel="谁的生日"
          aria-invalid={errors.name !== undefined}
          {...(errors.name === undefined ? {} : { 'aria-describedby': nameErrorId, accessibilityHint: errors.name })}
        />
      </FormRow>
      {errors.name !== undefined ? <RowMessage id={nameErrorId}>{errors.name}</RowMessage> : null}
      {people.length ? (
        <View accessibilityRole="radiogroup" accessibilityLabel="选择家人" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: activeTheme.spacing[2], paddingLeft: dense ? 0 : ROW_CONTENT_INSET, paddingBottom: activeTheme.spacing[3] }}>
          {people.map(person => {
            const selected = draft.name.trim() === person;
            return (
              <Pressable
                key={person}
                accessibilityRole="radio"
                accessibilityLabel={person}
                accessibilityState={{ checked: selected }}
                aria-checked={selected}
                disabled={submitting}
                onPress={() => update({ name: person })}
                style={({ pressed }) => ({ minHeight: activeTheme.controlSizes.compact, justifyContent: 'center', paddingHorizontal: activeTheme.spacing[3], borderRadius: activeTheme.borderRadii.full, borderWidth: activeTheme.borderWidths.default, borderColor: selected ? activeTheme.colors.primary : activeTheme.colors.outline, backgroundColor: selected ? activeTheme.colors.primary : pressed ? activeTheme.colors.surfaceMuted : activeTheme.colors.surface })}
              >
                <Text variant="bodySm" color={selected ? 'surface' : 'ink'}>{person}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <FormSection>
        <FormRow icon={rowIcon(Cake)}>
          <FilterOptions label="按农历还是公历过" hideLabel value={draft.calendar} options={CALENDARS} onChange={chooseCalendar} />
        </FormRow>
        <SummaryRow
          name="生日日期"
          icon={rowIcon(CalendarDays)}
          summary={chosen ? formatBirthdayDate(draft.calendar, draft.month, draft.day) : '选择日期'}
          muted={!chosen}
          open={picking}
          disabled={submitting}
          trigger={dateTrigger}
          onPress={() => setPicking(current => !current)}
        />
        {!inWindow && step ? <View style={{ paddingLeft: contentInset, paddingBottom: activeTheme.spacing[3] }}>{step.content}</View> : null}
        {errors.date !== undefined ? <RowMessage>{errors.date}</RowMessage> : null}
        <FormRow icon={rowIcon(Hash)}>
          <TextInput
            editable={!submitting}
            value={draft.birthYearText}
            onChangeText={text => update({ birthYearText: text.replace(/[^0-9]/g, '').slice(0, 4), ...(text === '' ? { alsoOther: false } : {}) })}
            keyboardType="number-pad"
            maxLength={4}
            placeholder={draft.calendar === 'lunar' ? '出生年份（农历，可不填）' : '出生年份（可不填）'}
            placeholderTextColor={activeTheme.colors.inkMuted}
            style={inputs.row}
            accessibilityLabel="出生年份"
            aria-invalid={errors.birthYear !== undefined}
            {...(errors.birthYear === undefined ? {} : { 'aria-describedby': yearErrorId, accessibilityHint: errors.birthYear })}
          />
        </FormRow>
        {errors.birthYear !== undefined
          ? <RowMessage id={yearErrorId}>{errors.birthYear}</RowMessage>
          : <View style={{ paddingLeft: contentInset, paddingBottom: activeTheme.spacing[1] }}><Text variant="caption" color="inkMuted">填了年份，日程里会显示几岁。</Text></View>}
        {other !== null ? (
          <FormRow icon={rowIcon(CalendarPlus)}>
            <View style={{ flex: 1 }}>
              <Text variant={textSize}>{other.calendar === 'solar' ? '也过公历生日' : '也过农历生日'}</Text>
              <Text variant="caption">{other.birthDate}</Text>
            </View>
            <Switch
              disabled={submitting}
              accessibilityLabel={other.calendar === 'solar' ? '也过公历生日' : '也过农历生日'}
              value={draft.alsoOther}
              onValueChange={alsoOther => update({ alsoOther })}
              trackColor={{ false: activeTheme.colors.border, true: activeTheme.colors.primary }}
              thumbColor={activeTheme.colors.surface}
              ios_backgroundColor={activeTheme.colors.border}
            />
          </FormRow>
        ) : null}
        <ReminderField
          kind="event"
          own
          dateOnly
          recurring
          value={choiceFromValue(reminder, alarm)}
          disabled={submitting}
          onChange={choice => { setReminder(choiceValue(choice)); setAlarm(alarmValue(choice)); }}
        />
      </FormSection>

      {preview.length ? (
        <View accessibilityLabel={`下一次：${preview.join('；')}`} style={{ marginTop: activeTheme.spacing[4], marginLeft: contentInset, padding: activeTheme.spacing[3], borderRadius: activeTheme.borderRadii.sm, backgroundColor: activeTheme.colors.surfaceSubtle, gap: activeTheme.spacing[1] }}>
          <Text variant="caption" color="inkMuted">下一次</Text>
          {preview.map(line => <Text key={line} variant="bodySm" color="ink">{line}</Text>)}
        </View>
      ) : null}
      {timeZoneError ? <RowMessage>无法识别当前设备的时区。请检查系统时区设置后重试。</RowMessage> : null}

      <FormActions onCancel={onCancel} onSubmit={submit} submitting={submitting} submitLabel="保存" />
    </Stack>
  );
}
