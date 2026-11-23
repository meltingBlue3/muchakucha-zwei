import type { PropsWithChildren } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useTranslation } from '../../i18n';
import type { SessionStateStore } from './session-state';
import type { RestoreOutcome, SessionTransport } from '../../platform/session/session-transport';
import { AuthShell, Button, Spinner, Stack, StatusPanel } from '../../ui/primitives';

export const SAFE_INTENDED_ROUTES = ['/household-handoff', '/profile', '/settings', '/reminders', '/inbox', '/households', '/households/new', '/overview/today', '/overview/events', '/overview/tasks'] as const;
export type SafeIntendedRoute = (typeof SAFE_INTENDED_ROUTES)[number] | `/households/${string}`;
export type SessionDestination = SafeIntendedRoute | '/login' | '/offline';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOUSEHOLD_PAGES = new Set(['more', 'settings', 'today', 'tasks', 'events', 'notes', 'labels', 'recurrence-rules', 'birthdays']);
const EDITABLE_RESOURCES = new Set(['tasks', 'events', 'notes']);

const isUuid = (value: string | undefined): boolean => value !== undefined && UUID_PATTERN.test(value);

function isHouseholdPage(value: string): boolean {
  const [prefix, root, householdId, ...segments] = value.split('/');
  if (prefix !== '' || root !== 'households' || !isUuid(householdId)) return false;
  const [section, resourceId, action] = segments;
  if (section === undefined) return true;
  if (section === 'assistant') {
    const [, collection, itemId, itemAction] = segments;
    if (segments.length === 1) return true;
    if (collection === 'providers') {
      return (segments.length === 2)
        || (segments.length === 3 && itemId === 'new')
        || (segments.length === 4 && isUuid(itemId) && (itemAction === 'edit' || itemAction === 'delete'));
    }
    if (collection === 'conversations' && isUuid(itemId)) {
      return segments.length === 3 || (segments.length === 4 && itemAction === 'delete');
    }
    return false;
  }
  if (segments.length === 1) return HOUSEHOLD_PAGES.has(section);
  if (segments.length === 2) {
    if (section === 'ownership') return resourceId === 'transfer' || resourceId === 'leave';
    if (EDITABLE_RESOURCES.has(section)) return resourceId === 'new' || isUuid(resourceId);
    if (section === 'birthdays') return resourceId === 'new';
    return section === 'recurrence-rules' && isUuid(resourceId);
  }
  if (segments.length !== 3 || !isUuid(resourceId)) return false;
  if (EDITABLE_RESOURCES.has(section)) return action === 'edit' || action === 'delete';
  if (section === 'recurrence-rules') return action === 'edit';
  if (section === 'members') return action === 'role' || action === 'remove';
  return section === 'invitations' && action === 'revoke';
}

export function sanitizeIntendedRoute(value: string | undefined): SafeIntendedRoute | undefined {
  const exact = SAFE_INTENDED_ROUTES.find((route) => route === value);
  if (exact !== undefined) return exact;
  if (value === undefined || /[?#\\]/.test(value) || value.includes('..')) return undefined;
  if (isHouseholdPage(value)) {
    return value as `/households/${string}`;
  }
  return undefined;
}

export interface SessionBootstrapProps extends PropsWithChildren {
  fontsReady: boolean;
  intendedRoute?: string | undefined;
  takeLaunchRoute?: () => Promise<string | null>;
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
  takeLaunchRoute,
  onRoute,
  restorationRequired = true,
  sessionStateStore,
  sessionTransport,
}: SessionBootstrapProps) => {
  const { t } = useTranslation('auth');
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
  const launchRoute = useRef<Promise<SafeIntendedRoute | undefined> | undefined>(undefined);
  const householdReady = householdReadyProp ?? true;

  const applyOutcome = useCallback(
    async (outcome: RestoreOutcome, destination?: SafeIntendedRoute): Promise<void> => {
      if (outcome.kind === 'authenticated') {
        sessionStateStore.enterAuthenticated(outcome.session);
        onRoute(destination ?? '/household-handoff');
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
        onRoute('/login', destination);
        setViewState('resolved');
        return;
      }
      sessionStateStore.enterUnauthenticated();
      onRoute('/login', destination);
      setViewState('resolved');
    }, [onRoute, sessionStateStore, sessionTransport],
  );

  const restore = useCallback(async (): Promise<void> => {
    setViewState('booting');
    try {
      // Read the tap once so a retry after going offline can still open its route.
      launchRoute.current ??= takeLaunchRoute?.().then(
        route => sanitizeIntendedRoute(route ?? undefined) ?? safeIntendedRoute,
        () => safeIntendedRoute,
      ) ?? Promise.resolve(safeIntendedRoute);
      const [outcome, destination] = await Promise.all([sessionTransport.restore(), launchRoute.current]);
      await applyOutcome(outcome, destination);
    } catch {
      await applyOutcome({ kind: 'offline', retainedCredential: true });
    }
  }, [applyOutcome, safeIntendedRoute, sessionTransport, takeLaunchRoute]);

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
          action={<Button label={t('offline.retry')} onPress={() => void restore()} />}
          body={t('offline.detail')}
          heading={t('offline.title')}
          kind="offline"
        />
      </AuthShell>
    );
  }

  if (viewState === 'booting') {
    return (
      <AuthShell>
        <Stack accessibilityLabel={t('restoring')} gap={6}>
          <Spinner label={t('restoring')} />
        </Stack>
      </AuthShell>
    );
  }

  // Session is resolved but household context is still loading — stay on the brand shell.
  if (viewState === 'resolved' && !householdReady) {
    return (
      <AuthShell>
        <Stack accessibilityLabel={t('loading')} gap={6}>
          <Spinner label={t('loading')} />
        </Stack>
      </AuthShell>
    );
  }

  return <>{children}</>;
};
