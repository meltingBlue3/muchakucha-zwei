import { router, Stack, usePathname } from 'expo-router';
import { useCallback } from 'react';

import {
  SessionBootstrap,
} from '../src/features/auth/session-bootstrap';
import { sessionStateStore, sessionTransport } from '../src/features/auth/session-runtime';
import { MuchakuchaThemeProvider } from '../src/ui/primitives';

export default function RootLayout() {
  const pathname = usePathname();
  const isPublicContinuation =
    pathname === '/register' ||
    pathname === '/verify-pending' ||
    pathname === '/auth/verify-email' ||
    pathname === '/forgot-password' ||
    pathname === '/auth/reset-password' ||
    pathname === '/reset-success';
  const routeSession = useCallback(
    (destination: '/household-handoff' | '/profile' | '/login' | '/offline', intendedRoute?: string) => {
      router.replace({
        pathname: destination,
        params:
          destination === '/login' && intendedRoute !== undefined
            ? { intended: intendedRoute, reason: 'reauth-required' }
            : undefined,
      } as never);
    },
    [],
  );

  return (
    <MuchakuchaThemeProvider>
      <SessionBootstrap
        fontsReady
        intendedRoute={pathname}
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
