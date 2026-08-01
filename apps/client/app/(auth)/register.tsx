import { ApiClient } from '@muchakucha/api-client';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { RegisterForm } from '../../src/features/auth/register-form';
import { pendingProofStore } from '../../src/platform/session/pending-proof.native';
import { AuthShell } from '../../src/ui/primitives';

const apiOrigin = process.env.EXPO_PUBLIC_API_ORIGIN ?? 'http://127.0.0.1:3000';
const apiClient = new ApiClient(apiOrigin);

export default function RegisterRoute() {
  const platform = Platform.OS === 'web' ? 'web' : 'native';

  return (
    <AuthShell>
      <RegisterForm
        apiClient={apiClient}
        onAccepted={(email) => {
          router.push({ pathname: './verify-pending', params: { email } });
        }}
        pendingProofStore={platform === 'native' ? pendingProofStore : undefined}
        platform={platform}
      />
    </AuthShell>
  );
}
