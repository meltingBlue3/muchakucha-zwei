import { ApiClient, type GetHouseholdResponseDto } from '@muchakucha/api-client';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { InvitationFlow } from '../../src/features/households/invitation-flow';
import { createSessionStateStore } from '../../src/features/auth/session-state';
import { createWebSessionTransport } from '../../src/platform/session/session-transport.web';
import { AuthShell } from '../../src/ui/primitives';

const API_ORIGIN = process.env.EXPO_PUBLIC_API_ORIGIN ?? 'http://127.0.0.1:3000';
const apiClient = new ApiClient(API_ORIGIN);
const sessionStateStore = createSessionStateStore();
const unsupportedRefresh = async (): Promise<never> => {
  throw new Error('Session refresh is owned by the session bootstrap flow.');
};
const webSessionTransport = createWebSessionTransport(unsupportedRefresh);

const INVITE_TOKEN_KEY = 'mk_invite_pending_token';

/**
 * D-07: Immediately sanitize the token-bearing URL from browser history.
 * The token is persisted in sessionStorage to survive the login round-trip.
 */
function sanitizeTokenBearingUrl(): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const doSanitize = () => {
      // Replace /invite/TOKEN with /invite in browser history.
      const sanitized = window.location.pathname.replace(/\/invite\/[^/]+$/, '/invite');
      if (sanitized !== window.location.pathname) {
        window.history.replaceState(window.history.state, '', sanitized);
      }
    };
    doSanitize();
    queueMicrotask(doSanitize);
  }
}

export default function InviteRoute() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const urlToken = Array.isArray(params.token) ? params.token[0] : params.token;

  // Persist the token across the login round-trip.
  // On first visit: token comes from the URL path segment (/invite/TOKEN).
  // On return after login: token is restored from sessionStorage.
  const [persistedToken, setPersistedToken] = useState<string | undefined>(() => {
    if (urlToken) return urlToken;
    if (typeof window !== 'undefined') return window.sessionStorage.getItem(INVITE_TOKEN_KEY) ?? undefined;
    return undefined;
  });

  // When we have a URL token, persist it and sanitize the URL.
  const sanitized = useRef(false);
  useLayoutEffect(() => {
    if (sanitized.current) return;
    sanitized.current = true;

    if (urlToken) {
      // Persist token to survive login redirect.
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(INVITE_TOKEN_KEY, urlToken);
      }
      // D-07: Sanitize the URL immediately.
      sanitizeTokenBearingUrl();
      setPersistedToken(urlToken);
    }
  }, [urlToken]);

  const [accessToken, setAccessToken] = useState<string>();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const stateResolved = useRef(false);

  // Resolve authentication state from the session store.
  useEffect(() => {
    if (stateResolved.current) return;
    stateResolved.current = true;

    const initial = sessionStateStore.get();
    if (initial.kind === 'authenticated') {
      setIsAuthenticated(true);
      setAccessToken(initial.accessToken);
    }

    const unsubscribe = sessionStateStore.subscribe((state) => {
      if (state.kind === 'authenticated') {
        setIsAuthenticated(true);
        setAccessToken(state.accessToken);
      }
    });

    return unsubscribe;
  }, []);

  const handleLogin = () => {
    // Navigate to the root; session-bootstrap handles auth and returns via intended route.
    router.replace('/' as never);
  };

  const handleRegister = () => {
    router.replace('/register' as never);
  };

  const handleSwitchAccount = () => {
    void webSessionTransport.clear();
    sessionStateStore.enterReauthenticationRequired('请切换到受邀账户。');
    router.replace('/login' as never);
  };

  const handleEnterHousehold = (household: GetHouseholdResponseDto) => {
    // Clear the pending token since the invitation has been consumed.
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(INVITE_TOKEN_KEY);
    }
    router.replace(`/households/${encodeURIComponent(household.id)}` as never);
  };

  if (!persistedToken) return null;

  return (
    <AuthShell>
      <InvitationFlow
        accessToken={accessToken}
        apiClient={apiClient}
        isAuthenticated={isAuthenticated}
        onEnterHousehold={handleEnterHousehold}
        onLogin={handleLogin}
        onRegister={handleRegister}
        onSwitchAccount={handleSwitchAccount}
        token={persistedToken}
      />
    </AuthShell>
  );
}
