import { router } from 'expo-router';
import { LogoutAction } from '../../src/features/auth/logout-action';
import { sessionApiClient, sessionStateStore, sessionTransport } from '../../src/features/auth/session-runtime';
import { ProfileForm } from '../../src/features/profile/profile-form';
import { AppShell } from '../../src/ui/household-components';
import { AccountCard } from '../../src/ui/account-components';
import { LinkText, Stack, Text } from '../../src/ui/primitives';
import { theme } from '../../src/ui/theme';

export default function ProfileRoute() {
  return (
    <AppShell title="个人中心" accessibilityLabel="个人中心" showBack onBack={() => router.canGoBack() ? router.back() : router.replace('/household-handoff')}>
      <Stack gap={6} style={{ width: '100%', maxWidth: theme.layout.authCardMaxWidth, alignSelf: 'center' }}>
        <AccountCard><ProfileForm apiClient={sessionApiClient} sessionStateStore={sessionStateStore} sessionTransport={sessionTransport} /></AccountCard>
        <AccountCard>
          <Stack gap={2}><Text variant="label">我的家庭</Text><Text variant="bodySm">查看家庭安排，或创建、加入一个家庭。</Text></Stack>
          <LinkText onPress={() => router.push('/household-handoff')}>前往我的家庭</LinkText>
        </AccountCard>
        <AccountCard>
          <Stack gap={2}><Text variant="label">登录与设备</Text><Text variant="bodySm">退出只影响这台设备，家庭里的内容会保留。</Text></Stack>
          <LogoutAction apiClient={sessionApiClient} onLoggedOut={() => router.replace('/login')} sessionStateStore={sessionStateStore} sessionTransport={sessionTransport} />
        </AccountCard>
      </Stack>
    </AppShell>
  );
}
