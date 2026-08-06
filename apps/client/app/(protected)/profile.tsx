import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';

import { LogoutAction } from '../../src/features/auth/logout-action';
import { sessionApiClient, sessionStateStore, sessionTransport } from '../../src/features/auth/session-runtime';
import { ProfileForm } from '../../src/features/profile/profile-form';
import { AuthShell, Stack } from '../../src/ui/primitives';
import { theme } from '../../src/ui/theme';

export default function ProfileRoute() {
  return (
    <AuthShell>
      <Stack gap={8}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable
            accessibilityLabel="返回"
            accessibilityRole="button"
            onPress={() => router.back()}
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: theme.controlSizes.touchTarget,
              minWidth: theme.controlSizes.touchTarget,
              marginLeft: -theme.spacing[2],
            }}
          >
            <ArrowLeft
              color={theme.colors.ink}
              size={theme.controlSizes.icon}
              strokeWidth={theme.controlSizes.iconStroke}
            />
          </Pressable>
        </View>
        <ProfileForm
          apiClient={sessionApiClient}
          sessionStateStore={sessionStateStore}
          sessionTransport={sessionTransport}
        />
        <LogoutAction
          apiClient={sessionApiClient}
          onLoggedOut={() => router.replace('/login' as never)}
          sessionStateStore={sessionStateStore}
          sessionTransport={sessionTransport}
        />
      </Stack>
    </AuthShell>
  );
}
