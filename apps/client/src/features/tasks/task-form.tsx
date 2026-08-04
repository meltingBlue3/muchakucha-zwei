import { useCallback, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { CreateTaskDto, TaskResponseDto } from '@muchakucha/api-client';
import type { Theme } from '../../ui/theme';
import { Stack, Text } from '../../ui/primitives';

const STATUSES = [
  { value: 'pending', label: '待办' },
  { value: 'in_progress', label: '进行中' },
  { value: 'completed', label: '已完成' },
] as const;

const PRIORITIES = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'urgent', label: '紧急' },
] as const;

interface MemberOption {
  userId: string;
  displayName: string;
}

export interface TaskInput {
  title: string;
  description: string;
  status: string;
  priority: string;
  assigneeId: string;
  dueDate: string;
}

const EMPTY_TASK: TaskInput = {
  title: '',
  description: '',
  status: 'pending',
  priority: 'medium',
  assigneeId: '',
  dueDate: '',
};

interface TaskFormProps {
  initial?: TaskResponseDto;
  members: MemberOption[];
  onSubmit: (data: CreateTaskDto) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  isSubmitting: boolean;
}

export function TaskForm({ initial, members, onSubmit, onCancel, submitLabel, isSubmitting }: TaskFormProps) {
  const activeTheme = useTheme<Theme>();
  const [form, setForm] = useState<TaskInput>(() => {
    if (initial) {
      return {
        title: initial.title,
        description: initial.description ?? '',
        status: initial.status,
        priority: initial.priority,
        assigneeId: initial.assigneeId ?? '',
        dueDate: initial.dueDate?.split('T')[0] ?? '',
      };
    }
    return { ...EMPTY_TASK };
  });
  const [error, setError] = useState<string | null>(null);

  const updateField = useCallback(<K extends keyof TaskInput>(key: K, value: TaskInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (form.title.trim().length === 0) {
      setError('请输入任务标题。');
      return;
    }

    const data: CreateTaskDto = {
      title: form.title.trim(),
      status: form.status,
      priority: form.priority,
    };

    if ((form.description ?? '').trim() !== '') data.description = (form.description ?? '').trim();
    if (form.assigneeId !== '') data.assigneeId = form.assigneeId;
    if (form.dueDate !== '') data.dueDate = new Date(form.dueDate + 'T00:00:00.000Z').toISOString();

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

  const chipStyle = (isSelected: boolean) => ({
    paddingHorizontal: activeTheme.spacing[3],
    paddingVertical: activeTheme.spacing[2],
    borderRadius: activeTheme.borderRadii.full,
    backgroundColor: isSelected ? activeTheme.colors.coral : activeTheme.colors.surfaceMuted,
    marginRight: activeTheme.spacing[2],
    marginBottom: activeTheme.spacing[2],
  });

  const chipTextColor = (isSelected: boolean) => (isSelected ? 'surface' as const : 'inkMuted' as const);

  return (
    <Stack gap={4}>
      {/* Title */}
      <Stack gap={1}>
        <Text variant="label">标题</Text>
        <TextInput
          value={form.title}
          onChangeText={(v) => updateField('title', v)}
          placeholder="任务标题"
          placeholderTextColor={activeTheme.colors.inkMuted}
          style={inputStyle}
          maxLength={200}
          accessibilityLabel="任务标题"
        />
      </Stack>

      {/* Status */}
      <Stack gap={1}>
        <Text variant="label">状态</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {STATUSES.map((s) => (
            <Pressable
              key={s.value}
              onPress={() => updateField('status', s.value)}
              style={({ pressed }) => [
                chipStyle(form.status === s.value),
                { opacity: pressed ? 0.7 : 1 },
              ]}
              accessibilityLabel={s.label}
            >
              <Text variant="bodySm" color={chipTextColor(form.status === s.value)}>
                {s.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Stack>

      {/* Priority */}
      <Stack gap={1}>
        <Text variant="label">优先级</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {PRIORITIES.map((p) => (
            <Pressable
              key={p.value}
              onPress={() => updateField('priority', p.value)}
              style={({ pressed }) => [
                chipStyle(form.priority === p.value),
                { opacity: pressed ? 0.7 : 1 },
              ]}
              accessibilityLabel={`优先级: ${p.label}`}
            >
              <Text variant="bodySm" color={chipTextColor(form.priority === p.value)}>
                {p.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Stack>

      {/* Assignee */}
      <Stack gap={1}>
        <Text variant="label">负责人（可选）</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Pressable
            onPress={() => updateField('assigneeId', '')}
            style={({ pressed }) => [
              chipStyle(form.assigneeId === ''),
              { opacity: pressed ? 0.7 : 1 },
            ]}
            accessibilityLabel="未分配"
          >
            <Text variant="bodySm" color={chipTextColor(form.assigneeId === '')}>
              未分配
            </Text>
          </Pressable>
          {members.map((m) => (
            <Pressable
              key={m.userId}
              onPress={() => updateField('assigneeId', m.userId)}
              style={({ pressed }) => [
                chipStyle(form.assigneeId === m.userId),
                { opacity: pressed ? 0.7 : 1 },
              ]}
              accessibilityLabel={`分配给 ${m.displayName}`}
            >
              <Text variant="bodySm" color={chipTextColor(form.assigneeId === m.userId)}>
                {m.displayName}
              </Text>
            </Pressable>
          ))}
        </View>
      </Stack>

      {/* Due date */}
      <Stack gap={1}>
        <Text variant="label">截止日期（可选）</Text>
        <TextInput
          value={form.dueDate}
          onChangeText={(v) => updateField('dueDate', v)}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={activeTheme.colors.inkMuted}
          style={inputStyle}
          accessibilityLabel="截止日期"
        />
      </Stack>

      {/* Description */}
      <Stack gap={1}>
        <Text variant="label">描述（可选）</Text>
        <TextInput
          value={form.description}
          onChangeText={(v) => updateField('description', v)}
          placeholder="任务描述"
          placeholderTextColor={activeTheme.colors.inkMuted}
          style={[inputStyle, { minHeight: 80, textAlignVertical: 'top' }]}
          multiline
          numberOfLines={4}
          accessibilityLabel="任务描述"
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
