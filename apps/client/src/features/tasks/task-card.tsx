import { Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { TaskResponseDto } from '@muchakucha/api-client';
import Circle from 'lucide-react-native/icons/circle';
import CircleCheckBig from 'lucide-react-native/icons/circle-check-big';
import Ban from 'lucide-react-native/icons/ban';
import type { Theme } from '../../ui/theme';
import { Stack, Text } from '../../ui/primitives';
import { LabelChip } from '../labels/label-chip';
import { RecurrenceBadge } from '../recurrence/recurrence-badge';
import { statusLabel, priorityLabel, formatDueDate, isOverdue } from './task-utils';
import { completionActionLabel } from './task-completion';

interface TaskCardProps {
  task: TaskResponseDto;
  assigneeNames?: string[];
  onPress: (task: TaskResponseDto) => void;
  onToggleComplete?: (task: TaskResponseDto) => void;
  statusChanging?: boolean;
  /** Failure from the last completion write on this card, shown beside it. */
  statusError?: string | null;
  onRetryStatus?: () => void;
  canUndoComplete?: boolean;
  onUndoComplete?: () => void;
}

export function TaskCard({
  task,
  assigneeNames,
  onPress,
  onToggleComplete,
  statusChanging = false,
  statusError = null,
  onRetryStatus,
  canUndoComplete = false,
  onUndoComplete,
}: TaskCardProps) {
  const activeTheme = useTheme<Theme>();
  const cancelled = task.status === 'cancelled';
  const completed = task.status === 'completed';
  const overdue = !cancelled && !completed && isOverdue(task.dueDate ?? null);
  // The control answers "is this done?", so it shows only a checked or an
  // unchecked mark. 进行中 is carried by the status text below, not by tinting
  // an otherwise identical circle.
  const StatusIcon = cancelled ? Ban : completed ? CircleCheckBig : Circle;
  const actionLabel = completionActionLabel(task.status);
  const feedback = statusError !== null || canUndoComplete;

  return (
    <View style={{ backgroundColor: activeTheme.colors.surface, borderRadius: activeTheme.borderRadii.xl, borderWidth: activeTheme.borderWidths.default, borderColor: activeTheme.colors.separator, padding: activeTheme.spacing[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        {onToggleComplete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            accessibilityState={{ disabled: statusChanging || cancelled, busy: statusChanging }}
            disabled={statusChanging || cancelled}
            onPress={() => onToggleComplete(task)}
            style={({ pressed }) => ({ minWidth: activeTheme.controlSizes.touchTarget, minHeight: activeTheme.controlSizes.touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: activeTheme.borderRadii.full, backgroundColor: pressed ? activeTheme.colors.tealSoft : activeTheme.colors.transparent })}
          >
            <StatusIcon size={activeTheme.spacing[6]} color={completed ? activeTheme.colors.teal : activeTheme.colors.border} strokeWidth={activeTheme.controlSizes.iconStroke} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`任务：${task.title}${task.recurrenceRuleId == null ? '' : '，重复'}`}
          onPress={() => onPress(task)}
          style={({ pressed }) => ({ flex: 1, minWidth: 0, padding: activeTheme.spacing[2], borderRadius: activeTheme.borderRadii.md, backgroundColor: pressed ? activeTheme.colors.surfaceSubtle : activeTheme.colors.transparent })}
        >
          <Stack gap={2}>
            <Text variant="body" numberOfLines={2} color={completed || cancelled ? 'inkMuted' : 'ink'} style={{ fontWeight: '600', textDecorationLine: completed || cancelled ? 'line-through' : 'none' }}>{task.title}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: activeTheme.spacing[2] }}>
              <Text variant="caption" color={task.status === 'in_progress' || completed ? 'teal' : 'inkMuted'}>{cancelled ? '已取消' : statusLabel(task.status)}</Text>
              <Text variant="caption" color={task.priority === 'urgent' ? 'destructive' : task.priority === 'high' ? 'coral' : 'inkMuted'}>{priorityLabel(task.priority)}</Text>
              {overdue ? <Text variant="caption" color="destructive">逾期</Text> : null}
              {task.recurrenceRuleId != null ? <RecurrenceBadge /> : null}
            </View>
            {task.dueDate ? <Text variant="caption" color={overdue ? 'destructive' : 'inkMuted'}>截止：{formatDueDate(task.dueDate)}</Text> : null}
            {assigneeNames && assigneeNames.length > 0 ? <Text variant="caption">负责人：{assigneeNames.join('、')}</Text> : null}
            {task.description ? <Text variant="bodySm" numberOfLines={2}>{task.description}</Text> : null}
            {(task.labels ?? []).length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: activeTheme.spacing[1] }}>
                {(task.labels ?? []).map((label) => <LabelChip key={label.id} label={label} small />)}
              </View>
            ) : null}
          </Stack>
        </Pressable>
      </View>

      {/* A sibling of the card body, never inside it: a control nested in the
          body pressable would be a button inside a button on Web. */}
      {feedback ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: activeTheme.spacing[3], marginTop: activeTheme.spacing[2], paddingHorizontal: activeTheme.spacing[2] }}>
          {statusError !== null ? (
            <>
              <Text variant="caption" color="destructive" accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ flexShrink: 1 }}>{statusError}</Text>
              {onRetryStatus ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`重试：${task.title}`}
                  onPress={onRetryStatus}
                  hitSlop={activeTheme.spacing[3]}
                  style={({ pressed }) => ({ minHeight: activeTheme.controlSizes.touchTarget, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
                >
                  <Text variant="label" color="coral">重试</Text>
                </Pressable>
              ) : null}
            </>
          ) : null}
          {statusError === null && canUndoComplete && onUndoComplete ? (
            <>
              <Text variant="caption" color="inkMuted" accessibilityLiveRegion="polite" style={{ flexShrink: 1 }}>已完成。</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`撤销完成：${task.title}`}
                onPress={onUndoComplete}
                hitSlop={activeTheme.spacing[3]}
                style={({ pressed }) => ({ minHeight: activeTheme.controlSizes.touchTarget, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
              >
                <Text variant="label" color="coral">撤销</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
