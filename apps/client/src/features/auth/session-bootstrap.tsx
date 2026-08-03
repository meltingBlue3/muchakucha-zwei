import type { PropsWithChildren } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { SessionStateStore } from './session-state';
import type { RestoreOutcome, SessionTransport } from '../../platform/session/session-transport';
import { AuthShell, Button, Spinner, Stack, StatusPanel } from '../../ui/primitives';

export const SAFE_INTENDED_ROUTES = ['/household-handoff', '/profile'] as const;
export type SafeIntendedRoute = (typeof SAFE_INTENDED_ROUTES)[number];
export type SessionDestination = SafeIntendedRoute | '/login' | '/offline';

export function sanitizeIntendedRoute(value: string | undefined): SafeIntendedRoute | undefined {
  return SAFE_INTENDED_ROUTES.find((route) => route === value);
}

export interface SessionBootstrapProps extends PropsWithChildren {
  fontsReady: boolean;
  intendedRoute?: string | undefined;
  onRoute(destination: SessionDestination, intendedRoute?: SafeIntendedRoute): void;
  /** When true, the bootstrap remains visible until household context is also resolved.
   *  Clients observing household resolution should set this to true once it is safe to show children. */
  householdReady?: boolean | undefined;
  restorationRequired?: boolean | undefined;
  sessionStateStore: SessionStateStore;
  sessionTransport: SessionTransport;
}

type ViewState = 'booting' | 'offline' | 'resolved';

export const SessionBootstrap = ({
  children,
  fontsReady,
  householdReady: householdReadyProp,
  intendedRoute,
  onRoute,
  restorationRequired = true,
  sessionStateStore,
  sessionTransport,
}: SessionBootstrapProps) => {
  const initialState = sessionStateStore.get();
  const shouldRestore = useRef(restorationRequired && initialState.kind === 'booting');
  const [viewState, setViewState] = useState<ViewState>(() =>
    !restorationRequired
      ? 'resolved'
      : initialState.kind === 'offlineWaiting'
      ? 'offline'
      : initialState.kind === 'booting'
        ? 'booting'
        : 'resolved',
  );
  const [safeIntendedRoute] = useState(() => sanitizeIntendedRoute(intendedRoute));
  const householdReady = householdReadyProp ?? true;

  const applyOutcome = useCallback(
    async (outcome: RestoreOutcome): Promise<void> => {
      if (outcome.kind === 'authenticated') {
        sessionStateStore.enterAuthenticated(outcome.session);
        onRoute(safeIntendedRoute ?? '/household-handoff');
        setViewState('resolved');
        return;
      }
      if (outcome.kind === 'offline') {
        sessionStateStore.enterOfflineWaiting();
        setViewState('offline');
        return;
      }
      if (outcome.kind === 'reauthRequired') {
        await sessionTransport.clear();
        sessionStateStore.enterReauthenticationRequired(outcome.reason);
        onRoute('/login', safeIntendedRoute);
        setViewState('resolved');
        return;
      }
      sessionStateStore.enterUnauthenticated();
      onRoute('/login');
      setViewState('resolved');
    }, [onRoute, safeIntendedRoute, sessionStateStore, sessionTransport],
  );

  const restore = useCallback(async (): Promise<void> => {
    setViewState('booting');
    try {
      await applyOutcome(await sessionTransport.restore());
    } catch {
      await applyOutcome({ kind: 'offline', retainedCredential: true });
    }
  }, [applyOutcome, sessionTransport]);

  useEffect(() => {
    if (fontsReady && shouldRestore.current) {
      shouldRestore.current = false;
      void restore();
    }
  }, [fontsReady, restore]);

  if (viewState === 'offline') {
    return (
      <AuthShell>
        <StatusPanel
          action={<Button label="重试连接" onPress={() => void restore()} />}
          body="你的登录状态仍保留。连接网络后重试即可。"
          heading="暂时无法连接"
          kind="offline"
        />
      </AuthShell>
    );
  }

  if (viewState === 'booting') {
    return (
      <AuthShell>
        <Stack accessibilityLabel="正在恢复登录状态" gap={6}>
          <Spinner label="正在恢复登录状态" />
        </Stack>
      </AuthShell>
    );
  }

  // Session is resolved but household context is still loading — stay on the brand shell.
  if (viewState === 'resolved' && !householdReady) {
    return (
      <AuthShell>
        <Stack accessibilityLabel="正在加载" gap={6}>
          <Spinner label="正在加载" />
        </Stack>
      </AuthShell>
    );
  }

  return <>{children}</>;
};
