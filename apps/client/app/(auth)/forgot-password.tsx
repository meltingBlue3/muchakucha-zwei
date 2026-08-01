import { ApiClient } from '@muchakucha/api-client';
import { router } from 'expo-router';

import { ForgotPasswordForm } from '../../src/features/auth/password-reset-flow';
import { AuthShell } from '../../src/ui/primitives';

const apiOrigin = process.env.EXPO_PUBLIC_API_ORIGIN ?? 'http://127.0.0.1:3000';
const apiClient = new ApiClient(apiOrigin);

export default function ForgotPasswordRoute() {
  return (
    <AuthShell>
      <ForgotPasswordForm apiClient={apiClient} onLogin={() => router.replace('/login' as never)} />
    </AuthShell>
  );
}
