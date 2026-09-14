import { router, useLocalSearchParams } from 'expo-router';
import { Platform } from 'react-native';

import { RegisterForm } from '../../src/features/auth/register-form';
import { sanitizeIntendedRoute } from '../../src/features/auth/session-bootstrap';
import { sessionApiClient, sessionStateStore, sessionTransport } from '../../src/features/auth/session-runtime';
import { AuthShell } from '../../src/ui/primitives';

export default function RegisterRoute() {
  const platform = Platform.OS === 'web' ? 'web' : 'native';
  const params = useLocalSearchParams<{ intended?: string }>();
  const intended = sanitizeIntendedRoute(typeof params.intended === 'string' ? params.intended : undefined);

  return (
    <AuthShell>
      <RegisterForm
        apiClient={sessionApiClient}
        onAuthenticated={() => router.replace((intended ?? '/household-handoff') as never)}
        onLogin={() => router.replace({ pathname: '/login', params: intended ? { intended } : {} } as never)}
        platform={platform}
        sessionStateStore={sessionStateStore}
        sessionTransport={sessionTransport}
      />
    </AuthShell>
  );
}
