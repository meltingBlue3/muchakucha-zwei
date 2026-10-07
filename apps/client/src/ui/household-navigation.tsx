import CalendarDays from 'lucide-react-native/icons/calendar-days';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import NotebookText from 'lucide-react-native/icons/notebook-text';
import Repeat from 'lucide-react-native/icons/repeat';
import Settings2 from 'lucide-react-native/icons/settings-2';
import Sparkles from 'lucide-react-native/icons/sparkles';
import Sun from 'lucide-react-native/icons/sun';
import Tag from 'lucide-react-native/icons/tag';
import type { ComponentType, ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, View, useWindowDimensions } from 'react-native';

import { Text } from './primitives';
import { theme } from './theme';

type Icon = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

const destinations: ReadonlyArray<{ key: 'today' | 'events' | 'tasks' | 'notes' | 'assistant'; label: string; icon: Icon }> = [
  { key: 'today', label: '今日', icon: Sun },
  { key: 'events', label: '日历', icon: CalendarDays },
  { key: 'tasks', label: '任务', icon: CircleCheck },
  { key: 'notes', label: '笔记', icon: NotebookText },
  { key: 'assistant', label: '助手', icon: Sparkles },
];

/**
 * The household's maintenance pages. Phones reach them from the household
 * menu; wide screens list them in the sidebar under the main destinations.
 */
export const familyPages: ReadonlyArray<{ key: 'settings' | 'labels' | 'recurrence-rules'; label: string; icon: Icon }> = [
  { key: 'settings', label: '家庭设置', icon: Settings2 },
  { key: 'labels', label: '标签管理', icon: Tag },
  { key: 'recurrence-rules', label: '重复安排', icon: Repeat },
];

export type FamilyPage = typeof familyPages[number]['key'];
/** `more` is the household page reached by link; it has no tab of its own. */
export type HouseholdTab = typeof destinations[number]['key'] | FamilyPage | 'more';

export const householdPath = (householdId: string, page: string): `/households/${string}` => `/households/${encodeURIComponent(householdId)}/${page}`;

/**
 * Phones: a bottom tab bar of the five daily destinations. Wide screens: a
 * sidebar with the household switch on top (`header`), the destinations, the
 * family pages, any page-specific content (`children`, such as the assistant's
 * conversations) and the account at the bottom (`footer`).
 */
export function HouseholdNavigation({ householdId, active, children, header, footer }: {
  householdId: string;
  active: HouseholdTab;
  children?: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= theme.layout.navigationBreakpoint;
  const go = (key: string) => {
    if (active !== key) router.replace(householdPath(householdId, key));
  };

  if (!wide) {
    return (
      <View
        accessibilityRole="tablist"
        accessibilityLabel="家庭主导航"
        style={{ flexDirection: 'row', backgroundColor: theme.colors.canvas, borderTopWidth: theme.borderWidths.default, borderTopColor: theme.colors.separator, paddingHorizontal: theme.spacing[1], paddingTop: theme.spacing[1], paddingBottom: theme.spacing[1] }}
      >
        {destinations.map(({ key, label, icon: TabIcon }) => {
          const selected = active === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              aria-selected={selected}
              onPress={() => go(key)}
              style={({ pressed }) => ({ flex: 1, minHeight: theme.controlSizes.touchTarget + theme.spacing[1], alignItems: 'center', justifyContent: 'center', gap: theme.spacing[1] / 2, borderRadius: theme.borderRadii.md, opacity: pressed ? 0.6 : 1 })}
            >
              <TabIcon size={theme.controlSizes.icon + 2} color={selected ? theme.colors.ink : theme.colors.inkFaint} strokeWidth={selected ? theme.focus.width : theme.controlSizes.iconStroke} />
              <Text variant="caption" color={selected ? 'ink' : 'inkFaint'} style={{ fontWeight: selected ? '600' : '500' }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  const item = (key: string, label: string, ItemIcon: Icon, role: 'tab' | 'link') => {
    const selected = active === key;
    return (
      <Pressable
        key={key}
        accessibilityRole={role}
        accessibilityLabel={label}
        {...(role === 'tab' ? { accessibilityState: { selected }, 'aria-selected': selected } : selected ? { 'aria-current': 'page' as const } : {})}
        onPress={() => role === 'tab' ? go(key) : active === key ? undefined : router.push(householdPath(householdId, key))}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3], minHeight: theme.spacing[10], paddingHorizontal: theme.spacing[3], borderRadius: theme.borderRadii.md, backgroundColor: selected ? theme.colors.surfaceSelected : pressed ? theme.colors.surfaceMuted : theme.colors.transparent })}
      >
        <ItemIcon size={theme.controlSizes.icon} color={selected ? theme.colors.ink : theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />
        <Text variant="bodySm" color={selected ? 'ink' : 'inkMuted'} style={{ fontWeight: selected ? '600' : '400' }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ width: theme.layout.navigationWidth, backgroundColor: theme.colors.canvas, borderRightWidth: theme.borderWidths.default, borderRightColor: theme.colors.separator, paddingHorizontal: theme.spacing[3], paddingTop: theme.spacing[4], paddingBottom: theme.spacing[3], gap: theme.spacing[5] }}>
      {header}
      <View accessibilityRole="tablist" accessibilityLabel="家庭主导航" style={{ gap: theme.spacing[1] / 2 }}>
        {destinations.map(({ key, label, icon }) => item(key, label, icon, 'tab'))}
      </View>
      <View style={{ gap: theme.spacing[1] / 2 }}>
        <Text variant="caption" color="inkFaint" style={{ paddingHorizontal: theme.spacing[3], marginBottom: theme.spacing[1] }}>家庭</Text>
        {familyPages.map(({ key, label, icon }) => item(key, label, icon, 'link'))}
      </View>
      {children ? <View style={{ flex: 1, minHeight: 0 }}>{children}</View> : <View style={{ flex: 1 }} />}
      {footer}
    </View>
  );
}
