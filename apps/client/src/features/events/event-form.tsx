import { DraftNotice } from '../../ui/draft-notice';
import { useWorkspaceState } from '../../ui/workspace-state';
import { useCallback, useState, type ReactNode } from 'react';
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
import { DateField } from '../../ui/date-field';
import { LabelPicker } from '../labels/label-picker';
import {
  recurrenceErrorsFromApi,
  recurrenceInputFromResponse,
  type RecurrenceInput,
} from '../recurrence/recurrence-picker';
import { RecurrenceField } from '../recurrence/recurrence-field';
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
  draftKey?: string;
  initial?: EventResponseDto;
  defaultDate?: string;
  onSubmit: (data: CreateEventDto) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  isSubmitting: boolean;
  householdId?: string;
  selectedLabelIds?: string[];
  onLabelChange?: (labelIds: string[]) => void;
}

export function EventForm({ draftKey, initial, defaultDate, onSubmit, onCancel, submitLabel, isSubmitting, householdId, selectedLabelIds, onLabelChange }: EventFormProps) {
  const activeTheme = useTheme<Theme>();
  // CR-03: the /series endpoint has no way to detach an occurrence into a
  // standalone item — selecting 不重复 here omits `recurrence` from the
  // payload, which the server reads as "unchanged" and just continues the
  // series. Disable the option entirely for an already-recurring event
  // rather than accept an edit that silently does nothing; 结束此重复 on
  // the rule detail screen is the real way to stop it.
  const isExistingRecurring = initial !== undefined && initial.recurrence !== null;
  const [form, setForm] = useWorkspaceState<EventInput>(draftKey, () => {
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
    const date = defaultDate ?? toDateIso(new Date());
    return { ...EMPTY_INPUT, startDate: date, endDate: date };
  });
  const [error, setError] = useState<string | null>(null);
  const [recurrenceErrors, setRecurrenceErrors] = useState<Record<string, string>>({});

  const updateField = useCallback(<K extends keyof EventInput>(key: K, value: EventInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
    if (key === 'recurrence') setRecurrenceErrors({});
  }, [setForm]);

  const setRecurrence = useCallback((next: RecurrenceInput | null) => updateField('recurrence', next), [updateField]);

  const handleSubmit = useCallback(async () => {
    if (form.title.trim().length === 0) {
      setError('请输入事件标题。');
      return;
    }
    if (form.recurrence?.endsOn !== undefined && form.recurrence.endsOn <= form.startDate) {
      setError('重复的截止日期必须晚于开始日期。');
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
      setError('请填写有效的开始和结束日期、时间。');
      return;
    }
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
  }, [form, onSubmit]);

  // Borderless inputs: the row icons and separators carry the structure.
  const inputStyle = {
    flex: 1,
    paddingVertical: activeTheme.spacing[3],
    fontSize: activeTheme.typography.body.fontSize,
    fontFamily: activeTheme.fontFamilies.regular,
    lineHeight: activeTheme.typography.body.lineHeight,
    color: activeTheme.colors.ink,
    minHeight: activeTheme.controlSizes.touchTarget,
  };

  return (
    <Stack gap={0}>
      {draftKey ? <DraftNotice /> : null}
      <FormRow>
        <TextInput
          editable={!isSubmitting}
          value={form.title}
          onChangeText={(v) => updateField('title', v)}
          placeholder="添加标题"
          placeholderTextColor={activeTheme.colors.inkMuted}
          style={[inputStyle, {
            fontSize: activeTheme.typography.heading.fontSize,
            lineHeight: activeTheme.typography.heading.lineHeight,
            fontWeight: activeTheme.typography.heading.fontWeight,
            paddingVertical: activeTheme.spacing[4],
          }]}
          maxLength={200}
          accessibilityLabel="事件标题"
        />
      </FormRow>

      <FormSection>
        <FormRow icon={<Clock size={activeTheme.controlSizes.icon} color={activeTheme.colors.inkMuted} strokeWidth={activeTheme.controlSizes.iconStroke} />}>
          <Text style={{ flex: 1 }}>全天</Text>
          <Switch
            disabled={isSubmitting}
            accessibilityLabel="全天事件"
            value={form.allDay}
            onValueChange={(v) => updateField('allDay', v)}
            trackColor={{ false: activeTheme.colors.border, true: activeTheme.colors.tealSoft }}
            thumbColor={form.allDay ? activeTheme.colors.teal : activeTheme.colors.surfaceMuted}
          />
        </FormRow>
        <FormRow>
          <DateField appearance="plain" disabled={isSubmitting} value={form.startDate} onChange={(v) => updateField('startDate', v)} mode="date" placeholder="选择开始日期" accessibilityLabel="开始日期" />
          {!form.allDay && (
            <DateField appearance="plain" align="end" disabled={isSubmitting} value={form.startTime} onChange={(v) => updateField('startTime', v)} mode="time" placeholder="开始时间" accessibilityLabel="开始时间" />
          )}
        </FormRow>
        <FormRow>
          <DateField appearance="plain" disabled={isSubmitting} value={form.endDate} onChange={(v) => updateField('endDate', v)} mode="date" placeholder="选择结束日期" accessibilityLabel="结束日期" />
          {!form.allDay && (
            <DateField appearance="plain" align="end" disabled={isSubmitting} value={form.endTime} onChange={(v) => updateField('endTime', v)} mode="time" placeholder="结束时间" accessibilityLabel="结束时间" />
          )}
        </FormRow>
        <RecurrenceField
          name="日程重复设置"
          icon={<Repeat size={activeTheme.controlSizes.icon} color={activeTheme.colors.inkMuted} strokeWidth={activeTheme.controlSizes.iconStroke} />}
          disabled={isSubmitting}
          disableTurnOff={isExistingRecurring}
          errors={recurrenceErrors}
          onChange={setRecurrence}
          startDate={form.startDate}
          value={form.recurrence}
        />
      </FormSection>

      <FormSection>
        <FormRow icon={<MapPin size={activeTheme.controlSizes.icon} color={activeTheme.colors.inkMuted} strokeWidth={activeTheme.controlSizes.iconStroke} />}>
          <TextInput
            editable={!isSubmitting}
            value={form.location}
            onChangeText={(v) => updateField('location', v)}
            placeholder="添加地点"
            placeholderTextColor={activeTheme.colors.inkMuted}
            style={inputStyle}
            maxLength={255}
            accessibilityLabel="地点"
          />
        </FormRow>
      </FormSection>

      <FormSection>
        <FormRow align="start" icon={<TextAlignStart size={activeTheme.controlSizes.icon} color={activeTheme.colors.inkMuted} strokeWidth={activeTheme.controlSizes.iconStroke} />}>
          <TextInput
            editable={!isSubmitting}
            value={form.description}
            onChangeText={(v) => updateField('description', v)}
            placeholder="添加说明"
            placeholderTextColor={activeTheme.colors.inkMuted}
            style={[inputStyle, { minHeight: activeTheme.spacing[16] + activeTheme.spacing[4], textAlignVertical: 'top' }]}
            multiline
            numberOfLines={4}
            accessibilityLabel="事件描述"
          />
        </FormRow>
      </FormSection>

      {householdId !== undefined && selectedLabelIds !== undefined && onLabelChange !== undefined && (
        <FormSection>
          <FormRow align="start" icon={<Tag size={activeTheme.controlSizes.icon} color={activeTheme.colors.inkMuted} strokeWidth={activeTheme.controlSizes.iconStroke} />}>
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
          {error}
        </Text>
      )}

      <FormActions onCancel={onCancel} onSubmit={() => void handleSubmit()} submitting={isSubmitting} submitLabel={submitLabel} />
    </Stack>
  );
}

/** A separated group of rows, like the blocks of a calendar compose sheet. */
function FormSection({ children }: { children: ReactNode }) {
  const activeTheme = useTheme<Theme>();
  return (
    <View style={{ borderTopWidth: activeTheme.borderWidths.default, borderTopColor: activeTheme.colors.separator, paddingVertical: activeTheme.spacing[2] }}>
      {children}
    </View>
  );
}

/** Icon column plus content; rows without an icon keep the same text edge. */
function FormRow({ icon, align = 'center', children }: { icon?: ReactNode; align?: 'center' | 'start'; children: ReactNode }) {
  const activeTheme = useTheme<Theme>();
  return (
    <View style={{ flexDirection: 'row', alignItems: align === 'start' ? 'flex-start' : 'center', gap: activeTheme.spacing[2], minHeight: activeTheme.controlSizes.touchTarget }}>
      <View importantForAccessibility="no-hide-descendants" aria-hidden style={{ width: activeTheme.controlSizes.touchTarget, minHeight: activeTheme.controlSizes.touchTarget, alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </View>
      {children}
    </View>
  );
}
