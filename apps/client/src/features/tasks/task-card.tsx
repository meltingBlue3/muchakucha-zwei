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
  const completed = task.status === 'completed';
  const overdue = !cancelled && !completed && isOverdue(task.dueDate ?? null);
  const StatusIcon = cancelled ? Ban : completed ? CircleCheckBig : Circle;
  const actionLabel = cancelled ? '这次重复已取消' : completed ? '重新打开任务' : task.status === 'in_progress' ? '完成任务' : '开始任务';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', backgroundColor: activeTheme.colors.surface, borderRadius: activeTheme.borderRadii.xl, borderWidth: activeTheme.borderWidths.default, borderColor: activeTheme.colors.separator, padding: activeTheme.spacing[3] }}>
      {onStatusChange ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          accessibilityState={{ disabled: statusChanging || cancelled, busy: statusChanging }}
          disabled={statusChanging || cancelled}
          onPress={() => onStatusChange(task)}
          style={({ pressed }) => ({ minWidth: activeTheme.controlSizes.touchTarget, minHeight: activeTheme.controlSizes.touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: activeTheme.borderRadii.full, backgroundColor: pressed ? activeTheme.colors.tealSoft : activeTheme.colors.transparent })}
        >
          <StatusIcon size={activeTheme.spacing[6]} color={completed || task.status === 'in_progress' ? activeTheme.colors.teal : activeTheme.colors.border} strokeWidth={activeTheme.controlSizes.iconStroke} />
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
  );
}
