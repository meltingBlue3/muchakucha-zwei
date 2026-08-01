import { ApiClient } from '@muchakucha/api-client';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { Platform } from 'react-native';

import { VerificationLanding } from '../../src/features/auth/verification-flow';
import { createSessionStateStore } from '../../src/features/auth/session-state';
import { pendingProofStore } from '../../src/platform/session/pending-proof.native';
import { createNativeSessionTransport } from '../../src/platform/session/session-transport.native';
import { createWebSessionTransport } from '../../src/platform/session/session-transport.web';
import { AuthShell } from '../../src/ui/primitives';

const apiOrigin = process.env.EXPO_PUBLIC_API_ORIGIN ?? 'http://127.0.0.1:3000';
const apiClient = new ApiClient(apiOrigin);
const sessionStateStore = createSessionStateStore();
const unsupportedRefresh = async (): Promise<never> => {
  throw new Error('Session refresh is owned by the session bootstrap flow.');
};
const nativeSessionTransport = createNativeSessionTransport(unsupportedRefresh);
const webSessionTransport = createWebSessionTransport(unsupportedRefresh);

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
        sessionTransport={platform === 'native' ? nativeSessionTransport : webSessionTransport}
        token={landingToken.current}
      />
    </AuthShell>
  );
}
