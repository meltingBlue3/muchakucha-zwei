import CalendarDays from 'lucide-react-native/icons/calendar-days';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import NotebookText from 'lucide-react-native/icons/notebook-text';
import PanelLeft from 'lucide-react-native/icons/panel-left';
import Repeat from 'lucide-react-native/icons/repeat';
import Settings2 from 'lucide-react-native/icons/settings-2';
import Sparkles from 'lucide-react-native/icons/sparkles';
import Sun from 'lucide-react-native/icons/sun';
import Tag from 'lucide-react-native/icons/tag';
import { useId, type ComponentType, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, View, useWindowDimensions } from 'react-native';

import { Text } from './primitives';
import { theme } from './theme';
import { useDesktop, useDesktopDensity } from './use-desktop';
import { useSidebarRail } from './sidebar-rail';

/** A number beside a sidebar destination: quiet for a count, vermilion when something is late. */
export interface NavBadge {
  value: number;
  /** Read after the destination's name, such as 「2 件逾期」. */
  description: string;
  tone: 'muted' | 'accent';
}

/** Collapses the desktop sidebar to a rail of icons, or expands it again. */
export function SidebarToggle() {
  const { rail, toggle } = useSidebarRail();
  const label = rail ? '展开侧栏' : '收起侧栏';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: !rail }}
      onPress={toggle}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ width: theme.controlSizes.avatar, height: theme.controlSizes.avatar, borderRadius: theme.borderRadii.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed || hovered ? theme.colors.surfaceMuted : theme.colors.transparent })}
    >
      <PanelLeft size={theme.controlSizes.icon - 4} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />
    </Pressable>
  );
}

/** Kept for screen readers, out of sight. */
const visuallyHidden = { position: 'absolute' as const, width: 1, height: 1, overflow: 'hidden' as const, opacity: 0 };

/** The badge's number, and in full for screen readers; the row names it as its description so the tab keeps its plain name. */
function Badge({ id, badge }: { id: string; badge: NavBadge }) {
  return (
    <View nativeID={id} style={{ marginLeft: 'auto' }}>
      <Text aria-hidden variant="meta" color={badge.tone === 'accent' ? 'accent' : 'inkFaint'} style={{ fontFamily: badge.tone === 'accent' ? theme.fontFamilies.numericStrong : theme.fontFamilies.numeric, fontWeight: badge.tone === 'accent' ? '600' : '400' }}>{badge.value}</Text>
      <Text style={visuallyHidden}>{badge.description}</Text>
    </View>
  );
}

type Icon = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

/** The five daily destinations, in the order of the tab bar and the sidebar. */
export const destinations: ReadonlyArray<{ key: 'today' | 'events' | 'tasks' | 'notes' | 'assistant'; label: string; icon: Icon }> = [
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
/**
 * `more` is the household page reached by link; it has no tab of its own.
 * `account` is a page of the person rather than the household (收件箱、个人中心)
 * shown inside the household frame on a wide screen.
 */
export type HouseholdTab = typeof destinations[number]['key'] | FamilyPage | 'more' | 'account';

export const householdPath = (householdId: string, page: string): `/households/${string}` => `/households/${encodeURIComponent(householdId)}/${page}`;

/**
 * Phones: a bottom tab bar of the five daily destinations. Wide screens: a
 * sidebar with the household switch on top (`header`), the destinations, the
 * family pages, any page-specific content (`children`, such as the assistant's
 * conversations) and the account at the bottom (`footer`).
 */
export function HouseholdNavigation({ householdId, active, belowActive = false, children, header, footer, badges }: {
  householdId: string;
  active: HouseholdTab;
  /** Desktop: numbers beside destinations, such as today's count and overdue tasks. */
  badges?: Partial<Record<HouseholdTab, NavBadge>>;
  /** The page sits below the selected destination (助手 › 模型配置), so selecting it again goes back up. */
  belowActive?: boolean;
  children?: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= theme.layout.navigationBreakpoint;
  const desktop = useDesktop();
  const dense = useDesktopDensity();
  const { rail } = useSidebarRail();
  const badgeId = useId();
  const go = (key: string) => {
    if (active !== key || belowActive) router.replace(householdPath(householdId, key));
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

  const item = (key: HouseholdTab, label: string, ItemIcon: Icon, role: 'tab' | 'link') => {
    const selected = active === key;
    const badge = !rail && desktop ? badges?.[key] : undefined;
    const shown = badge && badge.value > 0 ? badge : undefined;
    return (
      <Pressable
        key={key}
        accessibilityRole={role}
        accessibilityLabel={label}
        {...(shown ? { 'aria-describedby': `${badgeId}-${key}` } : {})}
        {...(role === 'tab' ? { accessibilityState: { selected }, 'aria-selected': selected } : selected ? { 'aria-current': 'page' as const } : {})}
        onPress={() => role === 'tab' ? go(key) : active === key ? undefined : router.push(householdPath(householdId, key))}
        {...(rail ? { title: label } : {})}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: rail ? 'center' : 'flex-start', gap: desktop ? theme.spacing[2] + 2 : theme.spacing[3], minHeight: dense ? theme.layout.desktopNavRow : theme.spacing[10], paddingHorizontal: rail ? theme.spacing[2] : desktop ? theme.spacing[2] + 2 : theme.spacing[3], borderRadius: desktop ? theme.borderRadii.sm : theme.borderRadii.md, backgroundColor: selected ? theme.colors.surfaceSelected : pressed || hovered ? theme.colors.surfaceMuted : theme.colors.transparent })}
      >
        <ItemIcon size={desktop ? theme.controlSizes.icon - 3 : theme.controlSizes.icon} color={selected ? theme.colors.ink : theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />
        {!rail ? <Text variant="bodySm" color={selected ? 'ink' : 'inkMuted'} style={{ fontWeight: selected ? '600' : '400' }}>{label}</Text> : null}
        {shown ? <Badge id={`${badgeId}-${key}`} badge={shown} /> : null}
      </Pressable>
    );
  };

  return (
    <View testID="global-sidebar" style={{ width: rail ? theme.layout.railWidth : theme.layout.navigationWidth, backgroundColor: theme.colors.canvas, paddingHorizontal: rail ? theme.spacing[2] : theme.spacing[3], paddingTop: theme.spacing[3], paddingBottom: theme.spacing[2] + 2, gap: theme.spacing[4] }}>
      {header}
      <View accessibilityRole="tablist" accessibilityLabel="家庭主导航" style={{ gap: theme.spacing[1] / 2 }}>
        {destinations.map(({ key, label, icon }) => item(key, label, icon, 'tab'))}
      </View>
      <View style={{ gap: theme.spacing[1] / 2 }}>
        {!rail ? <Text variant="caption" color="inkFaint" style={{ paddingHorizontal: desktop ? theme.spacing[2] + 2 : theme.spacing[3], marginTop: desktop ? theme.spacing[1] + 2 : 0, marginBottom: theme.spacing[1] + 2, fontWeight: '400' }}>家庭</Text> : null}
        {familyPages.map(({ key, label, icon }) => item(key, label, icon, 'link'))}
      </View>
      {!desktop && children ? <View style={{ flex: 1, minHeight: 0 }}>{children}</View> : <View style={{ flex: 1 }} />}
      {footer}
    </View>
  );
}
