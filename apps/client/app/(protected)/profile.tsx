import { router } from 'expo-router';

import { LogoutAction } from '../../src/features/auth/logout-action';
import { sessionApiClient, sessionStateStore, sessionTransport } from '../../src/features/auth/session-runtime';
import { ProfileForm } from '../../src/features/profile/profile-form';
import { AuthShell, Stack } from '../../src/ui/primitives';

export default function ProfileRoute() {
  return (
    <AuthShell>
      <Stack gap={8}>
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
