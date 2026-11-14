import { useTranslation } from '../../i18n';
import { DraftNotice } from '../../ui/draft-notice';
import { useWorkspaceState } from '../../ui/workspace-state';
import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { Switch, TextInput, View } from 'react-native';
import Clock from 'lucide-react-native/icons/clock';
import MapPin from 'lucide-react-native/icons/map-pin';
import Repeat from 'lucide-react-native/icons/repeat';
import Tag from 'lucide-react-native/icons/tag';
import TextAlignStart from 'lucide-react-native/icons/text-align-start';
import { useTheme } from '@shopify/restyle';
import type { CreateEventDto, EventResponseDto } from '@muchakucha/api-client';
import type { Theme } from '../../ui/theme';
import { Stack, Text, FormActions } from '../../ui/primitives';
import { FormRow, FormSection, RowMessage, rowIcon, useComposeInputStyles } from '../../ui/compose-rows';
import { useDesktopDensity } from '../../ui/use-desktop';
import { DateField } from '../../ui/date-field';
import { LabelPicker } from '../labels/label-picker';
import { focusFieldOnOpen } from '../../platform/keyboard/focus-on-open';
import {
  recurrenceErrorsFromApi,
  type RecurrenceErrorKey,
  recurrenceInputFromResponse,
  type RecurrenceInput,
} from '../recurrence/recurrence-options';
import { RecurrenceField } from '../recurrence/recurrence-field';
import { toDateIso } from './calendar-utils';
import { ReminderField } from '../reminders/reminder-field';
import { alarmValue, choiceFromValue, choiceValue, DEFAULT_REMINDER, fitChoice, sameChoice, type AlarmOptionValue, type ReminderOptionValue } from '../reminders/reminder-rules';

type EventInput = Omit<CreateEventDto, 'startTime' | 'endTime' | 'allDay' | 'recurrence'> & {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  allDay: boolean;
  recurrence: RecurrenceInput | null;
};

const EMPTY_INPUT: EventInput = {
  title: '',
  description: '',
  startDate: toDateIso(new Date()),
  startTime: '09:00',
  endDate: toDateIso(new Date()),
  endTime: '10:00',
  allDay: false,
  location: '',
  recurrence: null,
};

type EventSpan = Pick<EventInput, 'startDate' | 'startTime' | 'endDate' | 'endTime'>;

function localDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

/**
 * Moving the start carries the end along so the event keeps its length, as
 * in Google Calendar. An end already before the start is left for the user.
 */
export function moveEventStart(span: EventSpan, next: Partial<Pick<EventSpan, 'startDate' | 'startTime'>>): EventSpan {
  const moved = { ...span, ...next };
  const oldStart = localDateTime(span.startDate, span.startTime);
  const oldEnd = localDateTime(span.endDate, span.endTime);
  const newStart = localDateTime(moved.startDate, moved.startTime);
  const duration = oldEnd.getTime() - oldStart.getTime();
  if (![duration, newStart.getTime()].every(Number.isFinite) || duration < 0) return moved;
  const newEnd = new Date(newStart.getTime() + duration);
  return {
    ...moved,
    endDate: toDateIso(newEnd),
    endTime: `${String(newEnd.getHours()).padStart(2, '0')}:${String(newEnd.getMinutes()).padStart(2, '0')}`,
  };
}

interface EventFormProps {
  draftKey?: string;
  initial?: EventResponseDto;
  defaultDate?: string;
  /**
   * `data.myReminder` carries the person's own reminder. An edit also says
   * whether anything shared changed, so a reminder alone is not saved as an edit.
   */
  onSubmit: (data: CreateEventDto, edit: { contentChanged: boolean }) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  isSubmitting: boolean;
  householdId?: string;
  selectedLabelIds?: string[];
  onLabelChange?: (labelIds: string[]) => void;
}

/** The form as a saved event opens it. */
function eventInputFrom(initial: EventResponseDto): EventInput {
  const start = new Date(initial.startTime);
  const end = new Date(initial.endTime);
  return {
    title: initial.title,
    description: initial.description ?? '',
    startDate: toDateIso(start),
    startTime: `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
    endDate: toDateIso(end),
    endTime: `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`,
    allDay: initial.allDay,
    location: initial.location ?? '',
    recurrence: recurrenceInputFromResponse(initial.recurrence),
  };
}

export function EventForm({ draftKey, initial, defaultDate, onSubmit, onCancel, submitLabel, isSubmitting, householdId, selectedLabelIds, onLabelChange }: EventFormProps) {
  const { t } = useTranslation(['events', 'tasks']);
  const activeTheme = useTheme<Theme>();
  const inputs = useComposeInputStyles();
  const dense = useDesktopDensity();
  // The /series endpoint has no way to detach an occurrence into a
  // standalone item — selecting 不重复 here omits `recurrence` from the
  // payload, which the server reads as "unchanged" and just continues the
  // series. Disable the option entirely for an already-recurring event
  // rather than accept an edit that silently does nothing; 结束此重复 on
  // the rule detail screen is the real way to stop it.
  const isExistingRecurring = initial !== undefined && initial.recurrence !== null;
  const [form, setForm] = useWorkspaceState<EventInput>(draftKey, () => {
    if (initial) return eventInputFrom(initial);
    const date = defaultDate ?? toDateIso(new Date());
    return { ...EMPTY_INPUT, startDate: date, endDate: date };
  });
  const baseline = useMemo(() => initial ? eventInputFrom(initial) : null, [initial]);
  // Drafts of their own, so the shape of saved form drafts stays as it was.
  const [reminder, setReminder] = useWorkspaceState<ReminderOptionValue>(draftKey === undefined ? undefined : `${draftKey}:reminder`, () => choiceValue(initial?.myReminder ?? DEFAULT_REMINDER));
  const [alarm, setAlarm] = useWorkspaceState<AlarmOptionValue>(draftKey === undefined ? undefined : `${draftKey}:alarm`, () => alarmValue(initial?.myReminder ?? DEFAULT_REMINDER));
  // An existing series keeps its own anchor when just this occurrence moves.
  // New repeats still follow the event's first date.
  const recurrenceStart = initial?.recurrence?.startsOn ?? form.startDate;
  const [error, setError] = useState<'tasks:saveNetwork' | null>(null);
  const [titleError, setTitleError] = useState<'titleRequired' | null>(null);
  // Start and end checks, shown under the end row.
  const [timeError, setTimeError] = useState<'invalidTime' | 'endBeforeStart' | 'recurringTooLong' | null>(null);
  const titleInput = useRef<TextInput>(null);
  const titleErrorId = `event-title-error-${useId()}`;
  const [recurrenceErrors, setRecurrenceErrors] = useState<Record<string, RecurrenceErrorKey>>({});

  const updateField = useCallback(<K extends keyof EventInput>(key: K, value: EventInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
    if (key === 'title' && typeof value === 'string' && value.trim() !== '') setTitleError(null);
    if (key === 'endDate' || key === 'endTime' || key === 'allDay' || key === 'recurrence') setTimeError(null);
    if (key === 'recurrence') setRecurrenceErrors({});
  }, [setForm]);

  const setRecurrence = useCallback((next: RecurrenceInput | null) => updateField('recurrence', next), [updateField]);
  const moveStart = useCallback((next: Partial<Pick<EventSpan, 'startDate' | 'startTime'>>) => {
    setForm((prev) => ({ ...prev, ...moveEventStart(prev, next) }));
    setError(null);
    setTimeError(null);
    setRecurrenceErrors({});
  }, [setForm]);

  const handleSubmit = useCallback(async () => {
    if (form.title.trim().length === 0) {
      setTitleError('titleRequired');
      titleInput.current?.focus();
      return;
    }
    if (form.recurrence?.endsOn !== undefined && form.recurrence.endsOn <= recurrenceStart) {
      setRecurrenceErrors({ 'recurrence.endsOn': 'endOrder' });
      return;
    }

    // Validate end is after start
    const startDateTime = new Date(
      form.allDay
        ? `${form.startDate}T00:00:00`
        : `${form.startDate}T${form.startTime}:00`,
    );
    const endDateTime = new Date(
      form.allDay
        ? `${form.endDate}T23:59:59`
        : `${form.endDate}T${form.endTime}:00`,
    );
    if (!Number.isFinite(startDateTime.getTime()) || !Number.isFinite(endDateTime.getTime())) {
      setTimeError('invalidTime');
      return;
    }
    if (endDateTime <= startDateTime) {
      setTimeError('endBeforeStart');
      return;
    }
    // Mirrors the server's recurring_duration_too_long check (a recurring
    // event's duration_minutes has a DB CHECK of <= 1440): tell the user
    // before the round trip rather than after a 400 comes back. A
    // non-recurring event has no such cap — only the recurring branch
    // derives a per-occurrence duration from this span.
    if (form.recurrence !== null && endDateTime.getTime() - startDateTime.getTime() > 24 * 60 * 60 * 1000) {
      setTimeError('recurringTooLong');
      return;
    }

    // Always convert through new Date() so local date/time is
    // correctly mapped to UTC — never hardcode a Z suffix because
    // that would treat the local date as UTC midnight, shifting
    // the effective time by the timezone offset (e.g. +8 h for CST).
    const startTime = startDateTime.toISOString();
    const endTime = endDateTime.toISOString();

    const data: CreateEventDto = {
      title: form.title.trim(),
      startTime,
      endTime,
      allDay: form.allDay,
      ...(form.recurrence === null ? {} : { recurrence: form.recurrence }),
    };
    // Always include optional fields so the backend can clear them
    // (the update endpoint treats absent/undefined as "no change").
    data.description = (form.description ?? '').trim();
    data.location = (form.location ?? '').trim();
    const myReminder = fitChoice(choiceFromValue(reminder, alarm), form.allDay);
    if (initial !== undefined || !sameChoice(myReminder, DEFAULT_REMINDER)) data.myReminder = myReminder;

    try {
      await onSubmit(data, { contentChanged: baseline === null || JSON.stringify(form) !== JSON.stringify(baseline) });
    } catch (submitError: unknown) {
      const fieldErrors = recurrenceErrorsFromApi(submitError);
      if (Object.keys(fieldErrors).length > 0) {
        setRecurrenceErrors(fieldErrors);
      } else {
        setError('tasks:saveNetwork');
      }
    }
  }, [alarm, baseline, form, initial, onSubmit, recurrenceStart, reminder]);

  return (
    <Stack gap={0}>
      {draftKey ? <DraftNotice /> : null}
      <FormRow>
        <TextInput
          ref={titleInput}
          autoFocus={focusFieldOnOpen && initial === undefined}
          editable={!isSubmitting}
          value={form.title}
          onChangeText={(v) => updateField('title', v)}
          placeholder={t('tasks:addTitle')}
          placeholderTextColor={activeTheme.colors.inkMuted}
          style={inputs.title}
          maxLength={200}
          accessibilityLabel={t('titleField')}
          aria-invalid={titleError !== null}
          {...(titleError === null ? {} : { 'aria-describedby': titleErrorId, accessibilityHint: t(titleError) })}
        />
      </FormRow>
      {titleError !== null ? <RowMessage id={titleErrorId}>{t(titleError)}</RowMessage> : null}

      <FormSection>
        <FormRow icon={rowIcon(Clock)}>
          <Text variant={dense ? 'bodySm' : 'body'} style={{ flex: 1 }}>{t('allDay')}</Text>
          <Switch
            disabled={isSubmitting}
            accessibilityLabel={t('allDayField')}
            value={form.allDay}
            onValueChange={(v) => updateField('allDay', v)}
            // Like a system switch: a neutral track when off, the accent when on, and a white thumb.
            trackColor={{ false: activeTheme.colors.border, true: activeTheme.colors.primary }}
            thumbColor={activeTheme.colors.surface}
            ios_backgroundColor={activeTheme.colors.border}
          />
        </FormRow>
        <FormRow>
          <DateField appearance="plain" disabled={isSubmitting} value={form.startDate} onChange={(v) => moveStart({ startDate: v })} mode="date" placeholder={t('selectStartDate')} accessibilityLabel={t('startDate')} />
          {!form.allDay && (
            <DateField appearance="plain" align="end" disabled={isSubmitting} value={form.startTime} onChange={(v) => moveStart({ startTime: v })} mode="time" placeholder={t('startTime')} accessibilityLabel={t('startTime')} />
          )}
        </FormRow>
        <FormRow>
          <DateField appearance="plain" disabled={isSubmitting} value={form.endDate} onChange={(v) => updateField('endDate', v)} mode="date" placeholder={t('selectEndDate')} accessibilityLabel={t('endDate')} />
          {!form.allDay && (
            <DateField appearance="plain" align="end" disabled={isSubmitting} value={form.endTime} onChange={(v) => updateField('endTime', v)} mode="time" placeholder={t('endTime')} accessibilityLabel={t('endTime')} />
          )}
        </FormRow>
        {timeError !== null ? <RowMessage>{t(timeError)}</RowMessage> : null}
        <RecurrenceField
          name={t('recurrenceSetting')}
          icon={rowIcon(Repeat)}
          disabled={isSubmitting}
          disableTurnOff={isExistingRecurring}
          errors={recurrenceErrors}
          onChange={setRecurrence}
          startDate={recurrenceStart}
          value={form.recurrence}
        />
        <ReminderField
          kind="event"
          own
          dateOnly={form.allDay}
          recurring={form.recurrence !== null}
          value={choiceFromValue(reminder, alarm)}
          disabled={isSubmitting}
          onChange={(choice) => { setReminder(choiceValue(choice)); setAlarm(alarmValue(choice)); }}
        />
      </FormSection>

      <FormSection>
        <FormRow icon={rowIcon(MapPin)}>
          <TextInput
            editable={!isSubmitting}
            value={form.location}
            onChangeText={(v) => updateField('location', v)}
            placeholder={t('addLocation')}
            placeholderTextColor={activeTheme.colors.inkMuted}
            style={inputs.row}
            maxLength={255}
            accessibilityLabel={t('location')}
          />
        </FormRow>
      </FormSection>

      <FormSection>
        <FormRow align="start" icon={rowIcon(TextAlignStart)}>
          <TextInput
            editable={!isSubmitting}
            value={form.description}
            onChangeText={(v) => updateField('description', v)}
            placeholder={t('tasks:addDescription')}
            placeholderTextColor={activeTheme.colors.inkMuted}
            style={[inputs.row, { minHeight: activeTheme.spacing[16] + activeTheme.spacing[4], textAlignVertical: 'top' }]}
            multiline
            numberOfLines={4}
            accessibilityLabel={t('descriptionField')}
          />
        </FormRow>
      </FormSection>

      {householdId !== undefined && selectedLabelIds !== undefined && onLabelChange !== undefined && (
        <FormSection>
          <FormRow align="start" icon={rowIcon(Tag)}>
            <View style={{ flex: 1, paddingVertical: activeTheme.spacing[3] }}>
              <LabelPicker
                householdId={householdId}
                selectedLabelIds={selectedLabelIds}
                onChange={onLabelChange}
              />
            </View>
          </FormRow>
        </FormSection>
      )}

      {/* Error */}
      {error !== null && (
        <Text variant="bodySm" color="destructive" accessibilityRole="alert" style={{ marginTop: activeTheme.spacing[4] }}>
          {t(error)}
        </Text>
      )}

      <FormActions onCancel={onCancel} onSubmit={() => void handleSubmit()} submitting={isSubmitting} submitLabel={submitLabel} />
    </Stack>
  );
}
