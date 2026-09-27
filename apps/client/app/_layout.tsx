import { router, Stack, useGlobalSearchParams, usePathname } from 'expo-router';
import { useCallback, useEffect } from 'react';

import {
  sanitizeIntendedRoute,
  SessionBootstrap,
  type SafeIntendedRoute,
  type SessionDestination,
} from '../src/features/auth/session-bootstrap';
import { sessionStateStore, sessionTransport, setSessionLostHandler } from '../src/features/auth/session-runtime';
import { MuchakuchaThemeProvider } from '../src/ui/primitives';

export default function RootLayout() {
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ intended?: string }>();
  const intendedRoute = sanitizeIntendedRoute(
    pathname === '/login' || pathname === '/register'
      ? typeof params.intended === 'string' ? params.intended : undefined
      : pathname,
  );
  const isPublicContinuation = pathname === '/register';
  const routeSession = useCallback(
    (destination: SessionDestination, intended?: SafeIntendedRoute) => {
      const reauthenticationRequired = sessionStateStore.get().kind === 'reauthRequired';
      router.replace({
        pathname: destination,
        params: destination === '/login'
          ? {
              ...(intended === undefined ? {} : { intended }),
              ...(reauthenticationRequired ? { reason: 'reauth-required' } : {}),
            }
          : undefined,
      } as never);
    },
    [],
  );

  // An expired session found mid-use goes to sign-in and returns here afterwards.
  useEffect(() => {
    setSessionLostHandler(() => routeSession('/login', intendedRoute));
    return () => setSessionLostHandler(null);
  }, [routeSession, intendedRoute]);

  return (
    <MuchakuchaThemeProvider>
      <SessionBootstrap
        fontsReady
        intendedRoute={intendedRoute}
        onRoute={routeSession}
        restorationRequired={!isPublicContinuation}
        sessionStateStore={sessionStateStore}
        sessionTransport={sessionTransport}
      >
        <Stack screenOptions={{ headerShown: false }} />
      </SessionBootstrap>
    </MuchakuchaThemeProvider>
  );
}
