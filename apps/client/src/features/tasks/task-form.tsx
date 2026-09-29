import { DraftNotice } from '../../ui/draft-notice';
import { useWorkspaceState } from '../../ui/workspace-state';
import { useCallback, useId, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import Calendar from 'lucide-react-native/icons/calendar';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import Flag from 'lucide-react-native/icons/flag';
import Repeat from 'lucide-react-native/icons/repeat';
import Tag from 'lucide-react-native/icons/tag';
import TextAlignStart from 'lucide-react-native/icons/text-align-start';
import Users from 'lucide-react-native/icons/users';
import X from 'lucide-react-native/icons/x';
import { useTheme } from '@shopify/restyle';
import type { CreateTaskDto, TaskResponseDto } from '@muchakucha/api-client';
import type { Theme } from '../../ui/theme';
import { Stack, Text, FormActions } from '../../ui/primitives';
import { ChoiceField, FormRow, FormSection, ROW_CONTENT_INSET, RowMessage, rowIcon, rowInputStyle, titleInputStyle } from '../../ui/compose-rows';
import { DateField } from '../../ui/date-field';
import { toDateValue, toTimeValue } from '../../ui/date-values';
import { LabelPicker } from '../labels/label-picker';
import { RecurrenceField } from '../recurrence/recurrence-field';
import {
  followStartDate,
  recurrenceErrorsFromApi,
  recurrenceInputFromResponse,
  type RecurrenceInput,
} from '../recurrence/recurrence-options';

const STATUSES = [
  { value: 'pending', label: '待办' },
  { value: 'in_progress', label: '进行中' },
  { value: 'completed', label: '已完成' },
] as const;

const UNASSIGNED = '__unassigned__';

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
  /** Local "HH:MM" on the due date, or '' for a date without a time. */
  dueTime: string;
  recurrence: RecurrenceInput | null;
}

const EMPTY_TASK: TaskInput = {
  title: '',
  description: '',
  status: 'pending',
  priority: 'medium',
  assigneeIds: [],
  dueDate: '',
  dueTime: '',
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

/** Splits a stored due instant into the local date and, unless it is midnight, time. */
function dueFields(iso: string | null | undefined): Pick<TaskInput, 'dueDate' | 'dueTime'> {
  const date = iso ? new Date(iso) : null;
  if (date === null || Number.isNaN(date.getTime())) return { dueDate: '', dueTime: '' };
  const time = toTimeValue(date);
  return { dueDate: toDateValue(date), dueTime: time === '00:00' ? '' : time };
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
        ...dueFields(initial.dueDate),
        recurrence: recurrenceInputFromResponse(initial.recurrence),
      };
    }
    return { ...EMPTY_TASK };
  });
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const titleInput = useRef<TextInput>(null);
  const titleErrorId = `task-title-error-${useId()}`;
  const [recurrenceErrors, setRecurrenceErrors] = useState<Record<string, string>>({});

  // WR-07: an empty due date must never become the rule's startsOn — the
  // server rejects startsOn: ''. A new task's rule starts today (the server
  // derives each occurrence's due date from the rule), and an existing task
  // without a due date falls back to today as well.
  const recurrenceStart = isCreate || form.dueDate === '' ? todayIso : form.dueDate;

  const updateField = useCallback(<K extends keyof TaskInput>(key: K, value: TaskInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
    if (key === 'title' && typeof value === 'string' && value.trim() !== '') setTitleError(null);
    // The due date is the start the repeat's end date is checked against.
    if (key === 'recurrence' || key === 'dueDate') setRecurrenceErrors({});
  }, [setForm]);

  const handleSubmit = useCallback(async () => {
    if (form.title.trim().length === 0) {
      setTitleError('请输入任务标题。');
      titleInput.current?.focus();
      return;
    }
    // A new task's rule carries its own start, chosen on the custom repeat page.
    const ruleStart = isCreate && form.recurrence !== null ? form.recurrence.startsOn : recurrenceStart;
    if (form.recurrence?.endsOn !== undefined && form.recurrence.endsOn <= ruleStart) {
      setRecurrenceErrors({ 'recurrence.endsOn': '重复的截止日期必须晚于开始日期。' });
      return;
    }

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
      // Convert through new Date() so the local date and time map to UTC —
      // never hardcode Z, which would treat them as UTC. No time is midnight.
      data.dueDate = new Date(`${form.dueDate}T${form.dueTime || '00:00'}:00`).toISOString();
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
        setError('保存失败，请检查网络后重试。');
      }
    }
  }, [form, isCreate, onSubmit, recurrenceStart]);

  const setRecurrence = useCallback((next: RecurrenceInput | null) => updateField('recurrence', next), [updateField]);
  const recurringCreate = isCreate && form.recurrence !== null;
  const dueRow = recurringCreate && form.recurrence !== null ? {
    recurring: true,
    date: form.recurrence.startsOn,
    time: form.recurrence.startTimeLocal ?? '',
    setDate: (date: string) => { if (date !== '' && form.recurrence) setRecurrence(followStartDate(form.recurrence, date)); },
    setTime: (time: string) => { if (form.recurrence) setRecurrence({ ...form.recurrence, startTimeLocal: time }); },
    // The first day is required; only the time can be cleared.
    clearable: Boolean(form.recurrence.startTimeLocal),
    clear: () => { if (form.recurrence) { const { startTimeLocal: _cleared, ...rest } = form.recurrence; setRecurrence(rest); } },
  } : {
    recurring: false,
    date: form.dueDate,
    time: form.dueTime ?? '',
    setDate: (date: string) => updateField('dueDate', date),
    // A time alone means today, as in Google Tasks.
    setTime: (time: string) => setForm((prev) => ({ ...prev, dueTime: time, dueDate: prev.dueDate || todayIso })),
    clearable: form.dueDate !== '' || Boolean(form.dueTime),
    clear: () => setForm((prev) => ({ ...prev, dueDate: '', dueTime: '' })),
  };
  const memberNames = new Map(members.map(member => [member.userId, member.displayName]));
  const assigneeSummary = form.assigneeIds.map(id => memberNames.get(id)).filter(Boolean).join('、');
  const statusLabel = form.status === 'cancelled' ? '已取消' : STATUSES.find(status => status.value === form.status)?.label ?? form.status;
  const priorityLabel = PRIORITIES.find(priority => priority.value === form.priority)?.label ?? form.priority;

  return (
    <Stack gap={0}>
      {draftKey ? <DraftNotice /> : null}
      <FormRow>
        <TextInput
          ref={titleInput}
          editable={!isSubmitting}
          value={form.title}
          onChangeText={(v) => updateField('title', v)}
          placeholder="添加标题"
          placeholderTextColor={activeTheme.colors.inkMuted}
          style={titleInputStyle}
          maxLength={200}
          accessibilityLabel="任务标题"
          aria-invalid={titleError !== null}
          {...(titleError === null ? {} : { 'aria-describedby': titleErrorId, accessibilityHint: titleError })}
        />
      </FormRow>
      {titleError !== null ? <RowMessage id={titleErrorId}>{titleError}</RowMessage> : null}

      <FormSection>
        {/* One date-and-time row for every task. A new recurring task has no
            single due date (the server derives each occurrence's), so there the
            row sets the rule's first day and its time, the same values as the
            custom repeat page. */}
        <FormRow icon={rowIcon(Calendar)}>
          <DateField
            appearance="plain"
            disabled={isSubmitting}
            value={dueRow.date}
            onChange={dueRow.setDate}
            mode="date"
            placeholder="添加截止日期"
            accessibilityLabel={dueRow.recurring ? '首次截止日期' : '截止日期'}
          />
          <DateField
            appearance="plain"
            disabled={isSubmitting}
            value={dueRow.time}
            onChange={dueRow.setTime}
            mode="time"
            placeholder="添加时间"
            pickerDefault="09:00"
            accessibilityLabel={dueRow.recurring ? '每次的截止时间' : '截止时间'}
          />
          {dueRow.clearable ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={dueRow.recurring ? '清除每次的截止时间' : '清除截止日期'}
              disabled={isSubmitting}
              onPress={dueRow.clear}
              style={({ pressed }) => ({ width: activeTheme.controlSizes.touchTarget, height: activeTheme.controlSizes.touchTarget, borderRadius: activeTheme.borderRadii.full, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? activeTheme.colors.surfaceMuted : activeTheme.colors.transparent })}
            >
              <X size={activeTheme.controlSizes.icon} color={activeTheme.colors.inkMuted} strokeWidth={activeTheme.controlSizes.iconStroke} />
            </Pressable>
          ) : null}
        </FormRow>
        <RecurrenceField
          name="任务重复设置"
          icon={rowIcon(Repeat)}
          disabled={isSubmitting}
          disableTurnOff={isExistingRecurring}
          errors={recurrenceErrors}
          onChange={setRecurrence}
          startDate={recurrenceStart}
          ownStart={isCreate}
          value={form.recurrence}
        />
      </FormSection>

      <FormSection>
        <ChoiceField
          name="负责人"
          title="负责人"
          icon={rowIcon(Users)}
          summary={assigneeSummary || '未分配'}
          muted={assigneeSummary === ''}
          multiple
          emptyValue={UNASSIGNED}
          options={[{ value: UNASSIGNED, label: '未分配' }, ...members.map(member => ({ value: member.userId, label: member.displayName }))]}
          value={form.assigneeIds}
          disabled={isSubmitting}
          onChange={(ids) => updateField('assigneeIds', ids.filter(id => id !== UNASSIGNED))}
        />
        <ChoiceField
          name="任务状态"
          title="状态"
          icon={rowIcon(CircleCheck)}
          summary={statusLabel}
          options={STATUSES}
          value={[form.status]}
          disabled={isSubmitting}
          onChange={([status]) => { if (status) updateField('status', status); }}
        />
        {form.status === 'cancelled' ? (
          <View style={{ paddingLeft: ROW_CONTENT_INSET, flexDirection: 'row', alignItems: 'center', gap: activeTheme.spacing[2] }}>
            <Text variant="bodySm" style={{ flex: 1 }}>这一次已取消。</Text>
            <Pressable
              accessibilityLabel="恢复这一次"
              accessibilityRole="button"
              onPress={() => updateField('status', 'pending')}
              style={({ pressed }) => ({ justifyContent: 'center', minHeight: activeTheme.controlSizes.touchTarget, opacity: pressed ? 0.7 : 1 })}
            >
              <Text variant="label" color="link">恢复这一次</Text>
            </Pressable>
          </View>
        ) : null}
        <ChoiceField
          name="任务优先级"
          title="优先级"
          icon={rowIcon(Flag)}
          summary={`${priorityLabel}优先级`}
          options={PRIORITIES}
          value={[form.priority]}
          disabled={isSubmitting}
          onChange={([priority]) => { if (priority) updateField('priority', priority); }}
        />
      </FormSection>

      <FormSection>
        <FormRow align="start" icon={rowIcon(TextAlignStart)}>
          <TextInput
            editable={!isSubmitting}
            value={form.description}
            onChangeText={(v) => updateField('description', v)}
            placeholder="添加说明"
            placeholderTextColor={activeTheme.colors.inkMuted}
            style={[rowInputStyle, { minHeight: activeTheme.spacing[16] + activeTheme.spacing[4], textAlignVertical: 'top' }]}
            multiline
            numberOfLines={4}
            accessibilityLabel="任务描述"
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

      {error !== null && (
        <Text accessibilityRole="alert" variant="bodySm" color="destructive" style={{ marginTop: activeTheme.spacing[4] }}>
          {error}
        </Text>
      )}

      <FormActions onCancel={onCancel} onSubmit={() => void handleSubmit()} submitting={isSubmitting} submitLabel={submitLabel} />
    </Stack>
  );
}
