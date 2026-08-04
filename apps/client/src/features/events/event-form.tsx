import { useCallback, useState } from 'react';
import { Pressable, Switch, TextInput, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { CreateEventDto, EventResponseDto } from '@muchakucha/api-client';
import type { Theme } from '../../ui/theme';
import { Stack, Text } from '../../ui/primitives';
import { toDateIso } from './calendar-utils';

type EventInput = Omit<CreateEventDto, 'startTime' | 'endTime'> & {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
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
};

interface EventFormProps {
  initial?: EventResponseDto;
  onSubmit: (data: CreateEventDto) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  isSubmitting: boolean;
}

export function EventForm({ initial, onSubmit, onCancel, submitLabel, isSubmitting }: EventFormProps) {
  const activeTheme = useTheme<Theme>();
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
      };
    }
    return { ...EMPTY_INPUT };
  });
  const [error, setError] = useState<string | null>(null);

  const updateField = useCallback(<K extends keyof EventInput>(key: K, value: EventInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (form.title.trim().length === 0) {
      setError('请输入事件标题。');
      return;
    }

    const startTime = form.allDay
      ? `${form.startDate}T00:00:00.000Z`
      : new Date(`${form.startDate}T${form.startTime}:00`).toISOString();
    const endTime = form.allDay
      ? `${form.endDate}T23:59:59.999Z`
      : new Date(`${form.endDate}T${form.endTime}:00`).toISOString();

    const data: CreateEventDto = {
      title: form.title.trim(),
      startTime,
      endTime,
    };
    if ((form.description ?? '').trim() !== '') data.description = (form.description ?? '').trim();
    if (form.allDay) data.allDay = true;
    if ((form.location ?? '').trim() !== '') data.location = (form.location ?? '').trim();

    await onSubmit(data);
  }, [form, onSubmit]);

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
          <TextInput
            value={form.startDate}
            onChangeText={(v) => updateField('startDate', v)}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={activeTheme.colors.inkMuted}
            style={[inputStyle, { flex: form.allDay ? 1 : 1 }]}
            accessibilityLabel="开始日期"
          />
          {!form.allDay && (
            <TextInput
              value={form.startTime}
              onChangeText={(v) => updateField('startTime', v)}
              placeholder="HH:mm"
              placeholderTextColor={activeTheme.colors.inkMuted}
              style={[inputStyle, { flex: 1 }]}
              accessibilityLabel="开始时间"
            />
          )}
        </View>
      </Stack>

      {/* End date/time */}
      <Stack gap={1}>
        <Text variant="label">结束</Text>
        <View style={{ flexDirection: 'row', gap: activeTheme.spacing[2] }}>
          <TextInput
            value={form.endDate}
            onChangeText={(v) => updateField('endDate', v)}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={activeTheme.colors.inkMuted}
            style={[inputStyle, { flex: 1 }]}
            accessibilityLabel="结束日期"
          />
          {!form.allDay && (
            <TextInput
              value={form.endTime}
              onChangeText={(v) => updateField('endTime', v)}
              placeholder="HH:mm"
              placeholderTextColor={activeTheme.colors.inkMuted}
              style={[inputStyle, { flex: 1 }]}
              accessibilityLabel="结束时间"
            />
          )}
        </View>
      </Stack>

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
        >
          <Text variant="button" color="surface">
            {isSubmitting ? '保存中…' : submitLabel}
          </Text>
        </Pressable>
      </View>
    </Stack>
  );
}
