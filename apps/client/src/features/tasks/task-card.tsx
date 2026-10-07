import { CardActionsMenu } from '../../ui/card-actions-menu';
import { Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { TaskResponseDto } from '@muchakucha/api-client';
import type { Theme } from '../../ui/theme';
import { Text } from '../../ui/primitives';
import { CheckCircle } from '../../ui/check-circle';
import { ListRow, RowSlot } from '../../ui/list-group';
import { AvatarStack } from '../../ui/member-avatar';
import { LabelTags } from '../labels/label-chip';
import { RecurrenceBadge } from '../recurrence/recurrence-badge';
import { toDateValue, toTimeValue } from '../../ui/date-values';
import { statusLabel, formatDueDate, isOverdue } from './task-utils';
import { completionActionLabel } from './task-completion';

interface TaskCardProps {
  onEdit?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
  task: TaskResponseDto;
  /** The people the task is assigned to, shown as avatars. */
  assignees?: Array<{ id: string; name: string }>;
  onPress: (task: TaskResponseDto) => void;
  onToggleComplete?: (task: TaskResponseDto) => void;
  statusChanging?: boolean;
  /** Failure from the last completion write on this card, shown beside it. */
  statusError?: string | null;
  onRetryStatus?: () => void;
  /** A clock time for the leading column of a timeline; `''` keeps the column empty. */
  time?: string;
  /** Off where the list already says when the task is due, such as Today. */
  showDue?: boolean;
  /** The row whose detail is open beside the list on a wide screen. */
  selected?: boolean;
}

/** A due date in a row: only the clock time when it is today, nothing for today without a time. */
function dueText(iso: string | null): string {
  if (iso === null || iso === '') return '';
  const due = new Date(iso);
  if (toDateValue(due) !== toDateValue(new Date())) return formatDueDate(iso);
  const time = toTimeValue(due);
  return time === '00:00' ? '' : time;
}

/** One task as a list row: completion mark, title and details, then who it belongs to. */
export function TaskCard({
  task,
  assignees = [],
  onPress,
  onEdit,
  onDelete,
  onToggleComplete,
  statusChanging = false,
  statusError = null,
  onRetryStatus,
  time,
  showDue: showDueSetting = true,
  selected = false,
}: TaskCardProps) {
  const activeTheme = useTheme<Theme>();
  const cancelled = task.status === 'cancelled';
  const completed = task.status === 'completed';
  const closed = completed || cancelled;
  const overdue = !closed && isOverdue(task.dueDate ?? null);
  const urgent = !closed && task.priority === 'urgent';
  const dueLabel = dueText(task.dueDate ?? null);
  const showDue = showDueSetting && dueLabel !== '';
  const labels = task.labels ?? [];
  const hasDetails = showDue || overdue || task.status !== 'pending' || (!closed && (task.priority === 'high' || task.priority === 'urgent')) || task.recurrenceRuleId != null || labels.length > 0;

  return (
    <ListRow
      accessibilityLabel={`任务：${task.title}${task.recurrenceRuleId == null ? '' : '，重复'}`}
      onPress={() => onPress(task)}
      selected={selected}
      leading={<>
        {time !== undefined ? <RowSlot width={activeTheme.layout.timeColumn}><Text variant="time" style={{ paddingLeft: activeTheme.spacing[3] }}>{time}</Text></RowSlot> : null}
        {onToggleComplete ? (
          <CheckCircle
            state={cancelled ? 'void' : completed ? 'done' : 'open'}
            attention={overdue || urgent}
            accessibilityLabel={completionActionLabel(task.status)}
            disabled={statusChanging}
            busy={statusChanging}
            onPress={() => onToggleComplete(task)}
          />
        ) : null}
      </>}
      trailing={<>
        <AvatarStack members={assignees} />
        <CardActionsMenu subject={`任务：${task.title}`} disabled={statusChanging} actions={[
          ...(onEdit ? [{ kind: 'edit' as const, accessibilityLabel: `编辑任务：${task.title}`, onPress: onEdit }] : []),
          ...(onDelete ? [{ kind: 'delete' as const, accessibilityLabel: `删除任务：${task.title}`, onPress: onDelete }] : []),
        ]} />
      </>}
      footer={statusError !== null ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: activeTheme.spacing[3], paddingLeft: activeTheme.controlSizes.touchTarget + activeTheme.spacing[2], paddingRight: activeTheme.spacing[4], paddingBottom: activeTheme.spacing[2] }}>
          <Text variant="meta" color="destructive" accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ flexShrink: 1 }}>{statusError}</Text>
          {onRetryStatus ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`重试：${task.title}`}
              onPress={onRetryStatus}
              hitSlop={activeTheme.spacing[3]}
              style={({ pressed }) => ({ minHeight: activeTheme.controlSizes.touchTarget, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
            >
              <Text variant="label" color="link" style={{ textDecorationLine: 'underline' }}>重试</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    >
      <Text variant="body" numberOfLines={2} color={closed ? 'inkFaint' : 'ink'} style={{ textDecorationLine: closed ? 'line-through' : 'none' }}>{task.title}</Text>
      {hasDetails ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: activeTheme.spacing[2], rowGap: activeTheme.spacing[1], marginTop: activeTheme.spacing[1] / 2 }}>
          {showDue ? <Text variant="time" color={overdue ? 'accent' : 'inkMuted'}>{dueLabel}</Text> : null}
          {overdue ? <Text variant="meta" color="accent">逾期</Text> : null}
          {task.status !== 'pending' ? <Text variant="meta" color={completed ? 'success' : task.status === 'in_progress' ? 'ink' : 'inkMuted'}>{cancelled ? '已取消' : statusLabel(task.status)}</Text> : null}
          {!closed && task.priority === 'urgent' ? <Text variant="meta" color="accent">紧急</Text> : null}
          {!closed && task.priority === 'high' ? <Text variant="meta" color="ink">高优先级</Text> : null}
          {task.recurrenceRuleId != null ? <RecurrenceBadge /> : null}
          <LabelTags labels={labels} />
        </View>
      ) : null}
    </ListRow>
  );
}
