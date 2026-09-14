import { router, useLocalSearchParams } from 'expo-router';

import { LoginForm } from '../../src/features/auth/login-form';
import { sanitizeIntendedRoute } from '../../src/features/auth/session-bootstrap';
import { sessionStateStore, sessionTransport } from '../../src/features/auth/session-runtime';
import { AuthShell } from '../../src/ui/primitives';

export default function LoginRoute() {
  const params = useLocalSearchParams<{ intended?: string; reason?: string }>();
  const intended = sanitizeIntendedRoute(
    typeof params.intended === 'string' ? params.intended : undefined,
  );

  return (
    <AuthShell>
      <LoginForm
        onAuthenticated={() => router.replace((intended ?? '/household-handoff') as never)}
        onOffline={() => router.replace('/offline' as never)}
        onRegister={() => router.push({ pathname: '/register', params: intended ? { intended } : {} } as never)}
        reauthenticationRequired={params.reason !== undefined}
        sessionStateStore={sessionStateStore}
        sessionTransport={sessionTransport}
      />
    </AuthShell>
  );
}
