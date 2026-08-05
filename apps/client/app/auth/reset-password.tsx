import { ApiClient } from '@muchakucha/api-client';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { Platform } from 'react-native';

import { ResetPasswordLanding } from '../../src/features/auth/password-reset-flow';
import { AuthShell } from '../../src/ui/primitives';

const apiOrigin = process.env.EXPO_PUBLIC_API_ORIGIN ?? 'http://localhost:3000';
const apiClient = new ApiClient(apiOrigin);

function replaceTokenBearingLocation(): (() => void) | void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const clearBrowserLocation = () => {
      window.history.replaceState(null, '', window.location.pathname);
    };
    clearBrowserLocation();
    const sanitizationTimer = window.setInterval(clearBrowserLocation, 50);
    return () => window.clearInterval(sanitizationTimer);
  }
  router.setParams({ token: undefined });
}

export default function ResetPasswordRoute() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const landingToken = useRef<string | undefined>(token);
  if (!landingToken.current && token) landingToken.current = token;

  if (!landingToken.current) return null;

  return (
    <AuthShell>
      <ResetPasswordLanding
        apiClient={apiClient}
        onInvalidLink={() => undefined}
        onRequestNew={() => router.replace('/forgot-password' as never)}
        onSuccess={() => router.replace('/reset-success' as never)}
        replaceTokenBearingLocation={replaceTokenBearingLocation}
        token={landingToken.current}
      />
    </AuthShell>
  );
}
