import { useWorkspaceState } from '../../ui/workspace-state';
import { useCallback, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { CreateTaskDto, TaskResponseDto } from '@muchakucha/api-client';
import type { Theme } from '../../ui/theme';
import { Stack, Text, FormActions } from '../../ui/primitives';
import { DateField } from '../../ui/date-field';
import { LabelPicker } from '../labels/label-picker';
import {
  RecurrencePicker,
  recurrenceErrorsFromApi,
  recurrenceInputFromResponse,
  type RecurrenceInput,
} from '../recurrence/recurrence-picker';

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
  assigneeIds: string[];
  dueDate: string;
  recurrence: RecurrenceInput | null;
}

const EMPTY_TASK: TaskInput = {
  title: '',
  description: '',
  status: 'pending',
  priority: 'medium',
  assigneeIds: [],
  dueDate: '',
  recurrence: null,
};

interface TaskFormProps {
  draftKey?: string;
  initial?: TaskResponseDto;
  members: MemberOption[];
  onSubmit: (data: CreateTaskDto) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  isSubmitting: boolean;
  householdId?: string;
  selectedLabelIds?: string[];
  onLabelChange?: (labelIds: string[]) => void;
}

export function TaskForm({ draftKey, initial, members, onSubmit, onCancel, submitLabel, isSubmitting, householdId, selectedLabelIds, onLabelChange }: TaskFormProps) {
  const activeTheme = useTheme<Theme>();
  // A brand-new task's due date starts empty (`EMPTY_TASK.dueDate`), and the
  // server ignores the top-level `dueDate` entirely once `recurrence` is
  // present (each occurrence's own due date is derived from the rule's
  // walk instead — see TasksService.create). Coupling the picker's anchor
  // to the due-date field was therefore both pointless and actively broken:
  // an empty due date produced `startsOn: ''`, which fails the server's
  // `startsOn` format validation on every recurring create. Scoped to
  // create only — an existing recurring task's due date is a real,
  // independently-editable field (UpdateSeriesDto.dueDate), so editing
  // keeps the field and its current start-date coupling unchanged.
  const isCreate = initial === undefined;
  // CR-03: the /series endpoint has no way to detach an occurrence into a
  // standalone item — selecting 不重复 here omits `recurrence` from the
  // payload, which the server reads as "unchanged" and just continues the
  // series. Disable the option entirely for an already-recurring task
  // rather than accept an edit that silently does nothing; 结束此重复 on
  // the rule detail screen is the real way to stop it.
  const isExistingRecurring = initial !== undefined && initial.recurrence !== null;
  const [todayIso] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [form, setForm] = useWorkspaceState<TaskInput>(draftKey, () => {
    if (initial) {
      // Drop assignees who are no longer household members — the picker
      // below only offers current members as choices, so a stale ID here
      // would be invisible/unremovable in the UI yet still fail server-side
      // validation on every save, permanently blocking edits to this task.
      const currentMemberIds = new Set(members.map((m) => m.userId));
      return {
        title: initial.title,
        description: initial.description ?? '',
        status: initial.status,
        priority: initial.priority,
        assigneeIds: (initial.assigneeIds ?? []).filter((uid) => currentMemberIds.has(uid)),
        dueDate: initial.dueDate?.split('T')[0] ?? '',
        recurrence: recurrenceInputFromResponse(initial.recurrence),
      };
    }
    return { ...EMPTY_TASK };
  });
  const [error, setError] = useState<string | null>(null);
  const [recurrenceErrors, setRecurrenceErrors] = useState<Record<string, string>>({});
  const [recurrenceValid, setRecurrenceValid] = useState(true);

  const updateField = useCallback(<K extends keyof TaskInput>(key: K, value: TaskInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
    if (key === 'recurrence') setRecurrenceErrors({});
  }, [setForm]);

  const handleSubmit = useCallback(async () => {
    if (form.title.trim().length === 0) {
      setError('请输入任务标题。');
      return;
    }
    if (!recurrenceValid) return;

    const data: CreateTaskDto = {
      title: form.title.trim(),
      status: form.status,
      priority: form.priority,
      ...(form.recurrence === null ? {} : { recurrence: form.recurrence }),
    };

    // Always include optional fields so the backend can clear them
    // (the update endpoint treats absent/undefined as "no change").
    data.description = (form.description ?? '').trim();
    data.assigneeIds = form.assigneeIds;
    if (form.dueDate !== '') {
      // Convert through new Date() so local midnight is mapped to UTC —
      // never hardcode Z, which would treat the local date as UTC midnight.
      data.dueDate = new Date(form.dueDate + 'T00:00:00').toISOString();
    } else {
      data.dueDate = ''; // clears the due date
    }

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
    borderRadius: activeTheme.borderRadii.md,
    paddingHorizontal: activeTheme.spacing[4],
    paddingVertical: activeTheme.spacing[3],
    fontSize: activeTheme.typography.body.fontSize,
    fontFamily: activeTheme.fontFamilies.regular,
    lineHeight: activeTheme.typography.body.lineHeight,
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
      {draftKey ? <Text variant="caption">未保存内容会在本次登录期间暂存。保存成功后清除。</Text> : null}
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
        {form.status === 'cancelled' && (
          <View style={{ alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap' }}>
            <View
              accessibilityLabel="已取消"
              accessibilityRole="radio"
              accessibilityState={{ checked: true, disabled: true }}
              style={chipStyle(true)}
            >
              <Text variant="bodySm" color={chipTextColor(true)}>已取消</Text>
            </View>
            <Pressable
              accessibilityLabel="恢复这一次"
              accessibilityRole="button"
              onPress={() => updateField('status', 'pending')}
              style={({ pressed }) => ({
                justifyContent: 'center',
                minHeight: activeTheme.controlSizes.touchTarget,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text variant="label" color="link">恢复这一次</Text>
            </Pressable>
          </View>
        )}
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

      {/* Assignees (multiple allowed) */}
      <Stack gap={1}>
        <Text variant="label">负责人（可选，可多选）</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Pressable
            onPress={() => updateField('assigneeIds', [])}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: form.assigneeIds.length === 0 }}
            style={({ pressed }) => [
              chipStyle(form.assigneeIds.length === 0),
              { opacity: pressed ? 0.7 : 1 },
            ]}
            accessibilityLabel="未分配"
          >
            <Text variant="bodySm" color={chipTextColor(form.assigneeIds.length === 0)}>
              未分配
            </Text>
          </Pressable>
          {members.map((m) => {
            const selected = form.assigneeIds.includes(m.userId);
            return (
              <Pressable
                key={m.userId}
                onPress={() =>
                  updateField(
                    'assigneeIds',
                    selected
                      ? form.assigneeIds.filter((id) => id !== m.userId)
                      : [...form.assigneeIds, m.userId],
                  )
                }
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                style={({ pressed }) => [
                  chipStyle(selected),
                  { opacity: pressed ? 0.7 : 1 },
                ]}
                accessibilityLabel={`分配给 ${m.displayName}`}
              >
                <Text variant="bodySm" color={chipTextColor(selected)}>
                  {m.displayName}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Stack>

      {/* Due date — hidden for a new recurring task: the server ignores it
          once `recurrence` is set, and requiring it produced the startsOn
          validation error this comment block explains above. */}
      {!(isCreate && form.recurrence !== null) && (
        <DateField
          disabled={isSubmitting}
          value={form.dueDate}
          onChange={(v) => updateField('dueDate', v)}
          mode="date"
          label="截止日期（可选）"
          placeholder="YYYY-MM-DD"
          accessibilityLabel="截止日期"
        />
      )}

      {/* Description */}
      <RecurrencePicker
        disabled={isSubmitting}
        disableTurnOff={isExistingRecurring}
        errors={recurrenceErrors}
        onChange={(next) => updateField('recurrence', next)}
        onValidityChange={setRecurrenceValid}
        // WR-07: the same startsOn: '' failure the block above documents for
        // create is equally reachable on edit — an existing task with no due
        // date (the field is optional) hits it the moment recurrence is
        // turned on, or a recurring task re-saved after its due date was
        // cleared. Empty due date always falls back to todayIso, not just
        // in create mode.
        startDate={isCreate || form.dueDate === '' ? todayIso : form.dueDate}
        value={form.recurrence}
      />

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

      <FormActions onCancel={onCancel} onSubmit={() => void handleSubmit()} submitting={isSubmitting} submitLabel={submitLabel} />
    </Stack>
  );
}
