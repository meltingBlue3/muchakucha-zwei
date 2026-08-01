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
        intendedRoute={intended}
        onAuthenticated={() => router.replace('/household-handoff' as never)}
        onForgotPassword={() => router.push('/forgot-password' as never)}
        onOffline={() => router.replace('/offline' as never)}
        onRegister={() => router.push('/register' as never)}
        reauthenticationRequired={params.reason !== undefined}
        sessionStateStore={sessionStateStore}
        sessionTransport={sessionTransport}
      />
    </AuthShell>
  );
}
