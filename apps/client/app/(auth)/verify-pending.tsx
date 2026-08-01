import { ApiClient } from '@muchakucha/api-client';
import { useLocalSearchParams } from 'expo-router';
import { Linking } from 'react-native';

import { VerificationPending } from '../../src/features/auth/verification-flow';
import { AuthShell } from '../../src/ui/primitives';

const apiOrigin = process.env.EXPO_PUBLIC_API_ORIGIN ?? 'http://127.0.0.1:3000';
const apiClient = new ApiClient(apiOrigin);

export default function VerifyPendingRoute() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const deliveryAddress = typeof email === 'string' ? email : '';

  return (
    <AuthShell>
      <VerificationPending
        apiClient={apiClient}
        email={deliveryAddress}
        onOpenEmail={() => void Linking.openURL('mailto:')}
      />
    </AuthShell>
  );
}
