import { useTheme } from '@shopify/restyle';
import CalendarIcon from 'lucide-react-native/icons/calendar';
import ListTodoIcon from 'lucide-react-native/icons/list-todo';
import { View } from 'react-native';

import { Text } from '../../ui/primitives';
import type { Theme } from '../../ui/theme';

export type RecurrenceKind = 'task' | 'event';

// The label carries the semantics. Icon and text are both `inkMuted` on
// purpose: colour must never be the thing that distinguishes a task rule
// from an event rule in the merged list (D-20 accessibility floor).
const KIND_LABELS: Record<RecurrenceKind, string> = {
  task: '任务',
  event: '事件',
};

export function recurrenceKindLabel(kind: RecurrenceKind | null): string | null {
  return kind === null ? null : KIND_LABELS[kind];
}

export function RecurrenceKindBadge({ kind }: { kind: RecurrenceKind }) {
  const activeTheme = useTheme<Theme>();
  const Icon = kind === 'task' ? ListTodoIcon : CalendarIcon;

  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: activeTheme.colors.surfaceMuted,
        borderRadius: activeTheme.borderRadii.sm,
        flexDirection: 'row',
        gap: activeTheme.spacing[1],
        paddingHorizontal: activeTheme.spacing[2],
      }}
    >
      <Icon color={activeTheme.colors.inkMuted} size={14} strokeWidth={2} />
      <Text variant="caption" color="inkMuted">
        {KIND_LABELS[kind]}
      </Text>
    </View>
  );
}
