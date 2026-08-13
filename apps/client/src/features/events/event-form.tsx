import { useCallback, useState } from 'react';
import { Pressable, Switch, TextInput, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { CreateEventDto, EventResponseDto } from '@muchakucha/api-client';
import type { Theme } from '../../ui/theme';
import { Spinner, Stack, Text } from '../../ui/primitives';
import { DateField } from '../../ui/date-field';
import { LabelPicker } from '../labels/label-picker';
import {
  RecurrencePicker,
  recurrenceErrorsFromApi,
  recurrenceInputFromResponse,
  type RecurrenceInput,
} from '../recurrence/recurrence-picker';
import { toDateIso } from './calendar-utils';

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

interface EventFormProps {
  initial?: EventResponseDto;
  onSubmit: (data: CreateEventDto) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  isSubmitting: boolean;
  householdId?: string;
  selectedLabelIds?: string[];
  onLabelChange?: (labelIds: string[]) => void;
}

export function EventForm({ initial, onSubmit, onCancel, submitLabel, isSubmitting, householdId, selectedLabelIds, onLabelChange }: EventFormProps) {
  const activeTheme = useTheme<Theme>();
  // CR-03: the /series endpoint has no way to detach an occurrence into a
  // standalone item — selecting 不重复 here omits `recurrence` from the
  // payload, which the server reads as "unchanged" and just continues the
  // series. Disable the option entirely for an already-recurring event
  // rather than accept an edit that silently does nothing; 结束此重复 on
  // the rule detail screen is the real way to stop it.
  const isExistingRecurring = initial !== undefined && initial.recurrence !== null;
  const [form, setForm] = useState<EventInput>(() => {
    if (initial) {
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
    return { ...EMPTY_INPUT };
  });
  const [error, setError] = useState<string | null>(null);
  const [recurrenceErrors, setRecurrenceErrors] = useState<Record<string, string>>({});
  const [recurrenceValid, setRecurrenceValid] = useState(true);

  const updateField = useCallback(<K extends keyof EventInput>(key: K, value: EventInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
    if (key === 'recurrence') setRecurrenceErrors({});
  }, []);

  const handleSubmit = useCallback(async () => {
    if (form.title.trim().length === 0) {
      setError('请输入事件标题。');
      return;
    }
    if (!recurrenceValid) return;

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
    if (endDateTime <= startDateTime) {
      setError('结束时间必须晚于开始时间。');
      return;
    }
    // Mirrors the server's recurring_duration_too_long check (a recurring
    // event's duration_minutes has a DB CHECK of <= 1440): tell the user
    // before the round trip rather than after a 400 comes back. A
    // non-recurring event has no such cap — only the recurring branch
    // derives a per-occurrence duration from this span.
    if (form.recurrence !== null && endDateTime.getTime() - startDateTime.getTime() > 24 * 60 * 60 * 1000) {
      setError('重复事件的单次时长不能超过 24 小时。');
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

    try {
      await onSubmit(data);
    } catch (submitError: unknown) {
      const fieldErrors = recurrenceErrorsFromApi(submitError);
      if (Object.keys(fieldErrors).length > 0) {
        setRecurrenceErrors(fieldErrors);
      } else {
        setError('重复规则没有保存成功。请检查网络后重试。');
      }
    }
  }, [form, onSubmit, recurrenceValid]);

  const inputStyle = {
    backgroundColor: activeTheme.colors.surface,
    borderWidth: 1,
    borderColor: activeTheme.colors.border,
    borderRadius: activeTheme.borderRadii.sm,
    paddingHorizontal: activeTheme.spacing[4],
    paddingVertical: activeTheme.spacing[3],
    fontSize: activeTheme.typography.body.fontSize,
    color: activeTheme.colors.ink,
    minHeight: activeTheme.controlSizes.field,
  };

  return (
    <Stack gap={4}>
      {/* Title */}
      <Stack gap={1}>
        <Text variant="label">标题</Text>
        <TextInput
          value={form.title}
          onChangeText={(v) => updateField('title', v)}
          placeholder="事件标题"
          placeholderTextColor={activeTheme.colors.inkMuted}
          style={inputStyle}
          maxLength={200}
          accessibilityLabel="事件标题"
        />
      </Stack>

      {/* All day toggle */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="label">全天事件</Text>
        <Switch
          accessibilityLabel="全天事件"
          value={form.allDay}
          onValueChange={(v) => updateField('allDay', v)}
          trackColor={{ false: activeTheme.colors.border, true: activeTheme.colors.tealSoft }}
          thumbColor={form.allDay ? activeTheme.colors.teal : activeTheme.colors.surfaceMuted}
        />
      </View>

      {/* Start date/time */}
      <Stack gap={1}>
        <Text variant="label">开始</Text>
        <View style={{ flexDirection: 'row', gap: activeTheme.spacing[2] }}>
          <DateField
            disabled={isSubmitting}
            value={form.startDate}
            onChange={(v) => updateField('startDate', v)}
            mode="date"
            placeholder="YYYY-MM-DD"
            accessibilityLabel="开始日期"
          />
          {!form.allDay && (
            <DateField
              disabled={isSubmitting}
              value={form.startTime}
              onChange={(v) => updateField('startTime', v)}
              mode="time"
              placeholder="HH:mm"
              accessibilityLabel="开始时间"
            />
          )}
        </View>
      </Stack>

      {/* End date/time */}
      <Stack gap={1}>
        <Text variant="label">结束</Text>
        <View style={{ flexDirection: 'row', gap: activeTheme.spacing[2] }}>
          <DateField
            disabled={isSubmitting}
            value={form.endDate}
            onChange={(v) => updateField('endDate', v)}
            mode="date"
            placeholder="YYYY-MM-DD"
            accessibilityLabel="结束日期"
          />
          {!form.allDay && (
            <DateField
              disabled={isSubmitting}
              value={form.endTime}
              onChange={(v) => updateField('endTime', v)}
              mode="time"
              placeholder="HH:mm"
              accessibilityLabel="结束时间"
            />
          )}
        </View>
      </Stack>

      {/* Location */}
      <RecurrencePicker
        disabled={isSubmitting}
        disableTurnOff={isExistingRecurring}
        errors={recurrenceErrors}
        onChange={(next) => updateField('recurrence', next)}
        onValidityChange={setRecurrenceValid}
        startDate={form.startDate}
        value={form.recurrence}
      />

      {/* Location */}
      <Stack gap={1}>
        <Text variant="label">地点（可选）</Text>
        <TextInput
          value={form.location}
          onChangeText={(v) => updateField('location', v)}
          placeholder="地点"
          placeholderTextColor={activeTheme.colors.inkMuted}
          style={inputStyle}
          maxLength={255}
          accessibilityLabel="地点"
        />
      </Stack>

      {/* Description */}
      <Stack gap={1}>
        <Text variant="label">描述（可选）</Text>
        <TextInput
          value={form.description}
          onChangeText={(v) => updateField('description', v)}
          placeholder="事件描述"
          placeholderTextColor={activeTheme.colors.inkMuted}
          style={[inputStyle, { minHeight: 80, textAlignVertical: 'top' }]}
          multiline
          numberOfLines={4}
          accessibilityLabel="事件描述"
        />
      </Stack>

      {/* Labels */}
      {householdId !== undefined && selectedLabelIds !== undefined && onLabelChange !== undefined && (
        <Stack gap={1}>
          <Text variant="label">标签</Text>
          <LabelPicker
            householdId={householdId}
            selectedLabelIds={selectedLabelIds}
            onChange={onLabelChange}
          />
        </Stack>
      )}

      {/* Error */}
      {error !== null && (
        <Text variant="bodySm" color="destructive">
          {error}
        </Text>
      )}

      {/* Actions */}
      <View
        style={{
          flexDirection: 'row',
          gap: activeTheme.spacing[3],
          marginTop: activeTheme.spacing[2],
        }}
      >
        <Pressable
          onPress={onCancel}
          disabled={isSubmitting}
          style={({ pressed }) => ({
            flex: 1,
            alignItems: 'center',
            paddingVertical: activeTheme.spacing[3],
            borderRadius: activeTheme.borderRadii.sm,
            borderWidth: 1,
            borderColor: activeTheme.colors.border,
            opacity: pressed ? 0.7 : 1,
          })}
          accessibilityLabel="取消"
        >
          <Text variant="button" color="ink">
            取消
          </Text>
        </Pressable>
        <Pressable
          onPress={handleSubmit}
          disabled={isSubmitting}
          style={({ pressed }) => ({
            flex: 1,
            alignItems: 'center',
            paddingVertical: activeTheme.spacing[3],
            borderRadius: activeTheme.borderRadii.sm,
            backgroundColor: isSubmitting
              ? activeTheme.colors.disabled
              : pressed
                ? activeTheme.colors.coralPressed
                : activeTheme.colors.coral,
          })}
          accessibilityLabel={submitLabel}
          accessibilityState={{ busy: isSubmitting, disabled: isSubmitting }}
        >
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: activeTheme.spacing[2] }}>
            {isSubmitting && <Spinner label="保存中" />}
            <Text variant="button" color="surface">{isSubmitting ? '保存中…' : submitLabel}</Text>
          </View>
        </Pressable>
      </View>
    </Stack>
  );
}
