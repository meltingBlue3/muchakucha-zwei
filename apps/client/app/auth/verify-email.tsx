import { ApiClient } from '@muchakucha/api-client';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { Platform } from 'react-native';

import { VerificationLanding } from '../../src/features/auth/verification-flow';
import { sessionStateStore, sessionTransport } from '../../src/features/auth/session-runtime';
import { pendingProofStore } from '../../src/platform/session/pending-proof.native';
import { AuthShell } from '../../src/ui/primitives';

const apiOrigin = process.env.EXPO_PUBLIC_API_ORIGIN ?? 'http://localhost:3000';
const apiClient = new ApiClient(apiOrigin);

function replaceTokenBearingLocation(): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const clearBrowserQuery = () => {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    };
    clearBrowserQuery();
    queueMicrotask(clearBrowserQuery);
    return;
  }
  setTimeout(() => router.setParams({ token: undefined }), 0);
}

export default function VerifyEmailRoute() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const landingToken = useRef<string | undefined>(token);
  if (!landingToken.current && token) landingToken.current = token;
  const platform = Platform.OS === 'web' ? 'web' : 'native';

  if (!landingToken.current) return null;

  return (
    <AuthShell>
      <VerificationLanding
        apiClient={apiClient}
        onHouseholdHandoff={() => router.replace('/household-handoff' as never)}
        onLogin={() => router.replace('/')}
        {...(platform === 'native' ? { pendingProofStore } : {})}
        platform={platform}
        replaceTokenBearingLocation={replaceTokenBearingLocation}
        sessionStateStore={sessionStateStore}
        sessionTransport={sessionTransport}
        token={landingToken.current}
      />
    </AuthShell>
  );
}
