import Calendar from 'lucide-react-native/icons/calendar';
import FileText from 'lucide-react-native/icons/file-text';
import ListTodo from 'lucide-react-native/icons/list-todo';
import House from 'lucide-react-native/icons/house';
import Sunrise from 'lucide-react-native/icons/sunrise';
import { useRouter } from 'expo-router';
import { Pressable, View, useWindowDimensions } from 'react-native';

import { BrandMark, Text } from './primitives';
import { theme } from './theme';

const destinations = [
  { key: 'today', label: '今日', icon: Sunrise },
  { key: 'events', label: '日历', icon: Calendar },
  { key: 'tasks', label: '任务', icon: ListTodo },
  { key: 'notes', label: '笔记', icon: FileText },
  { key: 'more', label: '家庭', icon: House },
] as const;

export type HouseholdTab = typeof destinations[number]['key'];

export function HouseholdNavigation({ householdId, active }: { householdId: string; active: HouseholdTab }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= theme.layout.navigationBreakpoint;
  return (
    <View style={{ backgroundColor: theme.colors.surface, borderTopWidth: wide ? 0 : theme.borderWidths.default, borderTopColor: theme.colors.separator, borderRightWidth: wide ? theme.borderWidths.default : 0, borderRightColor: theme.colors.separator, width: wide ? theme.layout.navigationWidth : '100%', padding: wide ? theme.spacing[5] : theme.spacing[2], gap: theme.spacing[10] }}>
      {wide ? <View style={{ paddingTop: theme.spacing[4] }}><BrandMark /></View> : null}
      <View accessibilityRole="tablist" accessibilityLabel="家庭主导航" style={{ flexDirection: wide ? 'column' : 'row', width: '100%', maxWidth: theme.layout.householdMaxWidth, alignSelf: 'center', gap: theme.spacing[1] }}>
        {destinations.map(({ key, label, icon: Icon }) => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: active === key }}
            aria-selected={active === key}
            onPress={() => {
              if (active !== key) router.replace(`/households/${encodeURIComponent(householdId)}/${key}`);
            }}
            style={({ pressed }) => ({ flex: wide ? undefined : 1, flexDirection: wide ? 'row' : 'column', minHeight: theme.controlSizes.touchTarget, alignItems: 'center', justifyContent: wide ? 'flex-start' : 'center', paddingHorizontal: wide ? theme.spacing[4] : theme.spacing[1], paddingVertical: theme.spacing[2], borderRadius: theme.borderRadii.lg, gap: wide ? theme.spacing[3] : theme.spacing[1], backgroundColor: active === key ? theme.colors.coralSoft : pressed ? theme.colors.surfaceMuted : theme.colors.surface })}
          >
            <Icon size={theme.controlSizes.icon} color={active === key ? theme.colors.coral : theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />
            <Text variant={wide ? 'body' : 'caption'} color={active === key ? 'link' : 'inkMuted'} style={{ fontWeight: active === key ? '600' : '400' }}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
