import { Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { TaskResponseDto } from '@muchakucha/api-client';
import Ban from 'lucide-react-native/icons/ban';
import Circle from 'lucide-react-native/icons/circle';
import CircleCheckBig from 'lucide-react-native/icons/circle-check-big';
import type { Theme } from '../../ui/theme';
import { Stack, Text } from '../../ui/primitives';
import { LabelChip } from '../labels/label-chip';
import { RecurrenceBadge } from '../recurrence/recurrence-badge';
import { statusLabel, priorityLabel, formatDueDate, isOverdue } from './task-utils';

const BADGE_PADDING_V = 2;
const BADGE_PADDING_V_OUTLINE = 1;

interface TaskCardProps {
  task: TaskResponseDto;
  assigneeNames?: string[];
  onPress: (task: TaskResponseDto) => void;
  onStatusChange?: (task: TaskResponseDto) => void;
  statusChanging?: boolean;
}

export function TaskCard({ task, assigneeNames, onPress, onStatusChange, statusChanging = false }: TaskCardProps) {
  const activeTheme = useTheme<Theme>();
  const cancelled = task.status === 'cancelled';
  const overdue = !cancelled && isOverdue(task.dueDate ?? null);
  const canToggle = onStatusChange !== undefined;

  const statusColors: Record<string, string> = {
    pending: activeTheme.colors.border,
    in_progress: activeTheme.colors.teal,
    completed: activeTheme.colors.teal,
  };

  const priorityColors: Record<string, string> = {
    low: activeTheme.colors.inkMuted,
    medium: activeTheme.colors.teal,
    high: activeTheme.colors.coral,
    urgent: activeTheme.colors.destructive,
  };

  return (
    <Pressable
      onPress={() => onPress(task)}
      accessibilityLabel={`任务：${task.title}${task.recurrenceRuleId == null ? '' : '，重复'}`}
      style={({ pressed }) => ({
        backgroundColor: activeTheme.colors.surface,
        borderRadius: activeTheme.borderRadii.md,
        padding: activeTheme.spacing[4],
        borderWidth: 1,
        borderColor: activeTheme.colors.border,
        opacity: task.status === 'completed' || cancelled ? 0.6 : pressed ? 0.8 : 1,
      })}
    >
      <Stack gap={2}>
        {/* Top row: status + priority + toggle */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: activeTheme.spacing[2], flex: 1 }}>
            {cancelled ? (
              <View
                style={{
                  alignItems: 'center',
                  backgroundColor: activeTheme.colors.surfaceMuted,
                  borderRadius: activeTheme.borderRadii.sm,
                  flexDirection: 'row',
                  gap: activeTheme.spacing[1],
                  paddingHorizontal: activeTheme.spacing[2],
                  paddingVertical: BADGE_PADDING_V,
                }}
              >
                <Ban color={activeTheme.colors.inkMuted} size={14} strokeWidth={2} />
                <Text variant="caption" color="inkMuted">
                  已取消
                </Text>
              </View>
            ) : (
              <View
                style={{
                  backgroundColor: statusColors[task.status] ?? activeTheme.colors.border,
                  paddingHorizontal: activeTheme.spacing[2],
                  paddingVertical: BADGE_PADDING_V,
                  borderRadius: activeTheme.borderRadii.sm,
                }}
              >
                <Text variant="caption" color="surface">
                  {statusLabel(task.status)}
                </Text>
              </View>
            )}
            <View
              style={{
                backgroundColor: 'transparent',
                borderWidth: 1,
                borderColor: priorityColors[task.priority] ?? activeTheme.colors.border,
                paddingHorizontal: activeTheme.spacing[2],
                paddingVertical: BADGE_PADDING_V_OUTLINE,
                borderRadius: activeTheme.borderRadii.sm,
              }}
            >
              <Text variant="caption" color={task.priority === 'urgent' ? 'destructive' : 'inkMuted'}>
                {priorityLabel(task.priority)}
              </Text>
            </View>
            {overdue && (
              <Text variant="caption" color="destructive">
                逾期
              </Text>
            )}
            {task.recurrenceRuleId != null && <RecurrenceBadge />}
          </View>
          {canToggle && (
            <Pressable
              onPress={() => onStatusChange?.(task)}
              disabled={statusChanging || cancelled}
              accessibilityLabel={
                cancelled
                  ? '这次重复已取消'
                  : task.status === 'completed'
                  ? '重新打开任务'
                  : task.status === 'in_progress'
                    ? '完成任务'
                    : '开始任务'
              }
              accessibilityRole="button"
              accessibilityState={{ disabled: statusChanging || cancelled }}
              hitSlop={activeTheme.spacing[2]}
              style={({ pressed }) => ({
                opacity: statusChanging || cancelled ? 0.5 : pressed ? 0.7 : 1,
                padding: activeTheme.spacing[1],
              })}
            >
              {task.status === 'completed' ? (
                <CircleCheckBig
                  size={24}
                  color={activeTheme.colors.teal}
                  strokeWidth={1.5}
                />
              ) : (
                <Circle
                  size={24}
                  color={
                    task.status === 'in_progress'
                      ? activeTheme.colors.teal
                      : activeTheme.colors.border
                  }
                  strokeWidth={1.5}
                />
              )}
            </Pressable>
          )}
        </View>

        {/* Title */}
        <Text
          variant="label"
          numberOfLines={1}
          style={task.status === 'completed' || cancelled ? { textDecorationLine: 'line-through' } : undefined}
        >
          {task.title}
        </Text>

        {/* Due date + assignee */}
        <View style={{ flexDirection: 'row', gap: activeTheme.spacing[3] }}>
          {task.dueDate !== null && task.dueDate !== '' && (
            <Text variant="caption" color={overdue ? 'destructive' : 'inkMuted'}>
              截止：{formatDueDate(task.dueDate ?? null)}
            </Text>
          )}
          {assigneeNames !== undefined && assigneeNames.length > 0 && (
            <Text variant="caption" color="inkMuted">
              负责人：{assigneeNames.join('、')}
            </Text>
          )}
        </View>

        {/* Description preview */}
        {(task.description ?? null) !== null && task.description !== '' && (
          <Text variant="bodySm" numberOfLines={2} color="inkMuted">
            {task.description ?? ''}
          </Text>
        )}

        {/* Labels */}
        {(task.labels ?? []).length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: activeTheme.spacing[1] }}>
            {(task.labels ?? []).map((label) => (
              <LabelChip key={label.id} label={label} small />
            ))}
          </View>
        )}
      </Stack>
    </Pressable>
  );
}
