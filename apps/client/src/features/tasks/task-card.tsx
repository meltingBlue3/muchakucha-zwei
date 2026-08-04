import { Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { TaskResponseDto } from '@muchakucha/api-client';
import type { Theme } from '../../ui/theme';
import { Stack, Text } from '../../ui/primitives';
import { statusLabel, priorityLabel, formatDueDate, isOverdue } from './task-utils';

const BADGE_PADDING_V = 2;
const BADGE_PADDING_V_OUTLINE = 1;

interface TaskCardProps {
  task: TaskResponseDto;
  assigneeName?: string;
  onPress: (task: TaskResponseDto) => void;
}

export function TaskCard({ task, assigneeName, onPress }: TaskCardProps) {
  const activeTheme = useTheme<Theme>();
  const overdue = isOverdue(task.dueDate ?? null);

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
      accessibilityLabel={`任务：${task.title}`}
      style={({ pressed }) => ({
        backgroundColor: activeTheme.colors.surface,
        borderRadius: activeTheme.borderRadii.md,
        padding: activeTheme.spacing[4],
        borderWidth: 1,
        borderColor: activeTheme.colors.border,
        opacity: task.status === 'completed' ? 0.6 : pressed ? 0.8 : 1,
      })}
    >
      <Stack gap={2}>
        {/* Top row: status + priority */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: activeTheme.spacing[2] }}>
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
        </View>

        {/* Title */}
        <Text
          variant="label"
          numberOfLines={1}
          style={task.status === 'completed' ? { textDecorationLine: 'line-through' } : undefined}
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
          {assigneeName !== undefined && assigneeName !== '' && (
            <Text variant="caption" color="inkMuted">
              负责人：{assigneeName}
            </Text>
          )}
        </View>

        {/* Description preview */}
        {(task.description ?? null) !== null && task.description !== '' && (
          <Text variant="bodySm" numberOfLines={2} color="inkMuted">
            {task.description ?? ''}
          </Text>
        )}
      </Stack>
    </Pressable>
  );
}
