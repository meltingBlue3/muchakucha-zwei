import { ApiClient, type GetHouseholdResponseDto } from '@muchakucha/api-client';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { InvitationFlow } from '../../src/features/households/invitation-flow';
import { sessionStateStore, sessionTransport } from '../../src/features/auth/session-runtime';
import { createNativePendingInvitationStore } from '../../src/platform/invitation/pending-invitation.native';
import { createWebPendingInvitationStore } from '../../src/platform/invitation/pending-invitation.web';
import { AuthShell, Banner, Button, Heading, LinkText, Stack, Text, TextField } from '../../src/ui/primitives';

const API_ORIGIN = process.env.EXPO_PUBLIC_API_ORIGIN ?? 'http://localhost:3000';
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
  const [switchError, setSwitchError] = useState(false);
  const switching = useRef(false);
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
    router.replace({ pathname: '/register', params: { intended: '/invite' } } as never);
  };

  const handleSwitchAccount = () => {
    if (switching.current) return;
    switching.current = true;
    setSwitchError(false);
    void (async () => {
      try {
        const currentToken = sessionTransport.getAccessToken();
        if (currentToken !== null) await apiClient.logout(currentToken);
        await sessionTransport.clear();
        sessionStateStore.enterUnauthenticated();
        router.replace({ pathname: '/login', params: { intended: '/invite' } } as never);
      } catch {
        setSwitchError(true);
      } finally {
        switching.current = false;
      }
    })();
  };

  const handleEnterHousehold = (household: GetHouseholdResponseDto) => {
    // Clear the pending token since the invitation has been consumed.
    void pendingInvitationStore.clear();
    router.replace(`/households/${encodeURIComponent(household.id)}` as never);
  };

  // No-token manual entry.
  const [manualToken, setManualToken] = useState('');

  const handleSubmitManualToken = useCallback(() => {
    let trimmed = manualToken.trim();
    if (trimmed === '') return;

    // If the user pastes a full URL, extract the last path segment as the token.
    if (/^https?:\/\//i.test(trimmed)) {
      try {
        const segments = new URL(trimmed).pathname.split('/').filter(Boolean);
        const last = segments[segments.length - 1];
        if (last !== undefined && /^[A-Za-z0-9_-]+$/.test(last)) {
          trimmed = last;
        }
      } catch {
        // Keep the raw input if URL parsing fails.
      }
    }

    void pendingInvitationStore.set(trimmed).then(() => setPersistedToken(trimmed));
  }, [manualToken]);

  if (!persistedToken) {
    return (
      <AuthShell>
        <Stack gap={6}>
          <Stack gap={2}>
            <Heading>加入家庭</Heading>
            <Text>
              打开家庭管理员发来的邀请链接，登录受邀账户后即可接受邀请。
              你也可以将收到的邀请链接或邀请码粘贴到下方。
            </Text>
          </Stack>
          <Stack gap={2}>
            <TextField
              label="邀请链接或邀请码"
              value={manualToken}
              onChangeText={setManualToken}
              placeholder="粘贴邀请链接或邀请码"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={handleSubmitManualToken}
            />
            <Button
              disabled={manualToken.trim() === ''}
              label="查看邀请"
              onPress={handleSubmitManualToken}
            />
          </Stack>
          <LinkText onPress={() => router.replace(isAuthenticated ? '/household-handoff' : '/login')}>{isAuthenticated ? '返回设置家庭' : '返回登录'}</LinkText>
          <Text variant="caption" color="inkMuted">
            还没有邀请？请联系家庭管理员，让对方在家庭设置中发送邀请链接。
          </Text>
        </Stack>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <LinkText onPress={() => router.replace(isAuthenticated ? '/household-handoff' : '/login')}>{isAuthenticated ? '返回我的家庭' : '返回登录'}</LinkText>
      {switchError ? <Banner>暂时无法切换账户。请检查网络后重试。</Banner> : null}
      <InvitationFlow
        {...(accessToken === undefined ? {} : { accessToken })}
        apiClient={apiClient}
        isAuthenticated={isAuthenticated}
        onEnterHousehold={handleEnterHousehold}
        onLogin={handleLogin}
        onRegister={handleRegister}
        onSwitchAccount={handleSwitchAccount}
        onReset={() => {
          void pendingInvitationStore.clear().then(() => {
            setManualToken('');
            setPersistedToken(undefined);
          });
        }}
        token={persistedToken}
      />
    </AuthShell>
  );
}
