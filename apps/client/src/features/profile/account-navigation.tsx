import { usePathname, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Text } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import { LogoutAction } from '../auth/logout-action';
import { sessionApiClient, sessionStateStore, sessionTransport } from '../auth/session-runtime';

const destinations = [{ title: '个人资料', path: '/profile' }, { title: '提醒', path: '/reminders' }, { title: '收件箱', path: '/inbox' }, { title: '我的家庭', path: '/household-handoff' }] as const;
export function AccountNavigation() {
  const router = useRouter();
  const path = usePathname();
  return <View role="navigation" accessibilityLabel="个人中心导航" style={{ width: theme.layout.accountNavWidth, borderRightWidth: theme.borderWidths.default, borderRightColor: theme.colors.separator, padding: theme.spacing[4], gap: theme.spacing[2] }}>
    {destinations.map(destination => <Pressable key={destination.path} accessibilityRole="link" accessibilityLabel={destination.title} {...(path === destination.path ? { 'aria-current': 'page' as const } : {})} onPress={() => router.replace(destination.path)} style={({ pressed }) => ({ minHeight: theme.layout.desktopRowHeight, justifyContent: 'center', paddingHorizontal: theme.spacing[3], borderRadius: theme.borderRadii.sm, backgroundColor: path === destination.path ? theme.colors.surfaceSelected : pressed ? theme.colors.surfaceSubtle : theme.colors.transparent })}><Text variant="bodySm" color="ink">{destination.title}</Text></Pressable>)}
    <View style={{ flex: 1 }} />
    <LogoutAction apiClient={sessionApiClient} sessionStateStore={sessionStateStore} sessionTransport={sessionTransport} onLoggedOut={() => router.replace('/login')} />
  </View>;
}
