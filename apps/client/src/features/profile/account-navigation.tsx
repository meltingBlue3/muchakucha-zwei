import { usePathname, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Text } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import { LogoutAction } from '../auth/logout-action';
import { sessionApiClient, sessionStateStore, sessionTransport } from '../auth/session-runtime';
import { useInboxCount } from '../inbox/use-inbox-count';
import UserRound from 'lucide-react-native/icons/user-round';
import Bell from 'lucide-react-native/icons/bell';
import Inbox from 'lucide-react-native/icons/inbox';
import House from 'lucide-react-native/icons/house';

const destinations = [
  { title: '个人资料', path: '/profile', icon: UserRound },
  { title: '提醒', path: '/reminders', icon: Bell },
  { title: '收件箱', path: '/inbox', icon: Inbox },
  { title: '我的家庭', path: '/household-handoff', icon: House },
] as const;

export function AccountNavigation() {
  const router = useRouter();
  const path = usePathname();
  const inboxCount = useInboxCount(true);
  return <View role="navigation" accessibilityLabel="个人中心导航" style={{ width: theme.layout.accountNavWidth, borderRightWidth: theme.borderWidths.default, borderRightColor: theme.colors.separator, paddingHorizontal: theme.spacing[2] + 2, paddingVertical: theme.spacing[3], gap: theme.spacing[1] / 2 }}>
    {destinations.map(({ title, path: target, icon: Icon }) => {
      const current = path === target;
      const count = target === '/inbox' ? inboxCount : 0;
      return <Pressable key={target} accessibilityRole="link" accessibilityLabel={count ? `${title}，${count} 项待处理` : title} {...(current ? { 'aria-current': 'page' as const } : {})} onPress={() => router.replace(target)} style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ minHeight: theme.layout.desktopNavRow + theme.spacing[1], flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] + 2, paddingHorizontal: theme.spacing[2] + 2, borderRadius: theme.borderRadii.sm, backgroundColor: current ? theme.colors.surfaceSelected : pressed || hovered ? theme.colors.surfaceMuted : theme.colors.transparent })}>
        <Icon size={theme.controlSizes.icon - 4} color={current ? theme.colors.ink : theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />
        <Text variant="bodySm" color={current ? 'ink' : 'inkMuted'} style={{ flex: 1, fontWeight: current ? '600' : '400' }}>{title}</Text>
        {count ? <Text variant="caption" color="ink" style={{ fontFamily: theme.fontFamilies.numericStrong }}>{count}</Text> : null}
      </Pressable>;
    })}
    <View style={{ flex: 1 }} />
    <LogoutAction apiClient={sessionApiClient} sessionStateStore={sessionStateStore} sessionTransport={sessionTransport} onLoggedOut={() => router.replace('/login')} />
  </View>;
}
