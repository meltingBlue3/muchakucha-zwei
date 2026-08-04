import { ApiClient, type GetHouseholdResponseDto } from '@muchakucha/api-client';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { InvitationFlow } from '../../src/features/households/invitation-flow';
import { sessionStateStore, sessionTransport } from '../../src/features/auth/session-runtime';
import { createNativePendingInvitationStore } from '../../src/platform/invitation/pending-invitation.native';
import { createWebPendingInvitationStore } from '../../src/platform/invitation/pending-invitation.web';
import { AuthShell } from '../../src/ui/primitives';

const API_ORIGIN = process.env.EXPO_PUBLIC_API_ORIGIN ?? 'http://127.0.0.1:3000';
const apiClient = new ApiClient(API_ORIGIN);
const pendingInvitationStore = Platform.OS === 'web'
  ? createWebPendingInvitationStore()
  : createNativePendingInvitationStore();

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
  const [persistedToken, setPersistedToken] = useState<string | undefined>(urlToken);

  useEffect(() => {
    if (urlToken !== undefined) return;
    let active = true;
    void pendingInvitationStore.get().then((token) => {
      if (active && token !== null) setPersistedToken(token);
    });
    return () => {
      active = false;
    };
  }, [urlToken]);

  // When we have a URL token, persist it and sanitize the URL.
  const sanitized = useRef(false);
  useLayoutEffect(() => {
    if (sanitized.current) return;
    sanitized.current = true;

    if (urlToken) {
      setPersistedToken(urlToken);
      void pendingInvitationStore.set(urlToken).then(() => {
        // Use a real route replacement so Expo Router cannot restore the
        // token-bearing history entry after a direct history mutation.
        if (Platform.OS === 'web') router.replace('/invite' as never);
        else sanitizeTokenBearingUrl();
      });
    }
  }, [urlToken]);

  const [accessToken, setAccessToken] = useState<string>();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const stateResolved = useRef(false);

  // Resolve authentication state from the session store.
  useEffect(() => {
    if (stateResolved.current) return;
    stateResolved.current = true;
    let active = true;

    const initial = sessionStateStore.get();
    if (initial.kind === 'authenticated') {
      setIsAuthenticated(true);
      setAccessToken(initial.session.accessToken);
    }

    const unsubscribe = sessionStateStore.subscribe((state) => {
      if (state.kind === 'authenticated') {
        setIsAuthenticated(true);
        setAccessToken(state.session.accessToken);
      } else {
        setIsAuthenticated(false);
        setAccessToken(undefined);
      }
    });

    // Invitation previews remain publicly reachable, so the root bootstrap does
    // not restore or redirect on this route. A fresh authenticated deep link
    // must still recover the HttpOnly-cookie session opportunistically.
    if (initial.kind === 'booting') {
      void sessionTransport.restore().then((outcome) => {
        if (!active) return;
        if (outcome.kind === 'authenticated') {
          sessionStateStore.enterAuthenticated(outcome.session);
        } else {
          sessionStateStore.enterUnauthenticated();
        }
      }).catch(() => {
        if (active) sessionStateStore.enterUnauthenticated();
      });
    }

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const handleLogin = () => {
    router.replace({ pathname: '/login', params: { intended: '/invite' } } as never);
  };

  const handleRegister = () => {
    router.replace('/register' as never);
  };

  const handleSwitchAccount = () => {
    void sessionTransport.clear();
    sessionStateStore.enterUnauthenticated();
    router.replace('/login' as never);
  };

  const handleEnterHousehold = (household: GetHouseholdResponseDto) => {
    // Clear the pending token since the invitation has been consumed.
    void pendingInvitationStore.clear();
    router.replace(`/households/${encodeURIComponent(household.id)}` as never);
  };

  if (!persistedToken) return null;

  return (
    <AuthShell>
      <InvitationFlow
        {...(accessToken === undefined ? {} : { accessToken })}
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
