import { createContext, useContext, type ReactNode } from 'react';
import { View } from 'react-native';
import { Heading, Stack, Text } from './primitives';
import { theme } from './theme';

/** AppShell places the shared creation control in the desktop title row. */
export const PageCreateActionContext = createContext<ReactNode>(null);

/** Compact title row for the household's primary destinations. */
export function PageIntro({ title, action }: {
  title: string;
  action?: ReactNode;
}) {
  const createAction = useContext(PageCreateActionContext);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing[4] }}>
      <Heading variant="heading" style={{ flex: 1 }}>{title}</Heading>
      {action || createAction ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] }}>{action}{createAction}</View> : null}
    </View>
  );
}

export function TodaySummary({ events, tasks, overdue }: { events: number; tasks: number; overdue: number }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: theme.colors.surface, borderRadius: theme.borderRadii.xl, paddingVertical: theme.spacing[5] }}>
      {[
        { label: '今日日程', value: events, color: 'coral' as const },
        { label: '今日待办', value: tasks, color: 'teal' as const },
        { label: '逾期待办', value: overdue, color: overdue > 0 ? 'destructive' as const : 'inkMuted' as const },
      ].map(({ label, value, color }, index) => (
        <Stack key={label} gap={2} style={{ flex: 1, alignItems: 'center', borderLeftWidth: index === 0 ? 0 : theme.borderWidths.default, borderLeftColor: theme.colors.separator }}>
          <Text variant="display" color={color}>{value}</Text>
          <Text variant="caption">{label}</Text>
        </Stack>
      ))}
    </View>
  );
}
