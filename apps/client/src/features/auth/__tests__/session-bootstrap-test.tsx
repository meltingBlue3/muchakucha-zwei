import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { SessionTransport } from '../../../platform/session/session-transport';
import { MuchakuchaThemeProvider, Text } from '../../../ui/primitives';
import {
  sanitizeIntendedRoute,
  SessionBootstrap,
  type SessionDestination,
} from '../session-bootstrap';
import { createSessionStateStore } from '../session-state';

const currentUser = {
  displayName: '家庭成员',
  email: 'member@example.test',
  emailVerified: true,
  hasHousehold: false as const,
  id: 'user-1',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function createTransport(
  outcome: Awaited<ReturnType<SessionTransport['restore']>> = { kind: 'unauthenticated' },
): SessionTransport {
  return {
    acceptIssuedSession: jest.fn(),
    clear: jest.fn().mockResolvedValue(undefined),
    getAccessToken: jest.fn().mockReturnValue(null),
    loadCurrentUser: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    restore: jest.fn().mockResolvedValue(outcome),
  };
}

async function renderBootstrap(options: {
  fontsReady?: boolean;
  intendedRoute?: string;
  outcome?: Awaited<ReturnType<SessionTransport['restore']>>;
  transport?: SessionTransport;
} = {}) {
  const sessionStateStore = createSessionStateStore();
  const sessionTransport = options.transport ?? createTransport(options.outcome);
  const stateAtNavigation: unknown[] = [];
  const onRoute = jest.fn((destination: SessionDestination) => {
    stateAtNavigation.push({ destination, state: sessionStateStore.get() });
  });
  const view = await render(
    <MuchakuchaThemeProvider>
      <SessionBootstrap
        fontsReady={options.fontsReady ?? true}
        intendedRoute={options.intendedRoute}
        onRoute={onRoute}
        sessionStateStore={sessionStateStore}
        sessionTransport={sessionTransport}
      >
        <Text>resolved application</Text>
      </SessionBootstrap>
    </MuchakuchaThemeProvider>,
  );
  return { onRoute, sessionStateStore, sessionTransport, stateAtNavigation, view };
}

describe('session bootstrap contract', () => {
  test('holds the branded splash until fonts and session restoration both resolve', async () => {
    const pending = deferred<Awaited<ReturnType<SessionTransport['restore']>>>();
    const transport = createTransport();
    (transport.restore as jest.Mock).mockReturnValue(pending.promise);
    const result = await renderBootstrap({ fontsReady: false, transport });

    expect(result.view.getByLabelText('Muchakucha Zwei')).toBeTruthy();
    expect(result.view.getAllByLabelText('正在恢复登录状态').length).toBeGreaterThan(0);
    expect(result.view.queryByText('resolved application')).toBeNull();
    expect(transport.restore).not.toHaveBeenCalled();

    await result.view.rerender(
      <MuchakuchaThemeProvider>
        <SessionBootstrap
          fontsReady
          onRoute={result.onRoute}
          sessionStateStore={result.sessionStateStore}
          sessionTransport={transport}
        >
          <Text>resolved application</Text>
        </SessionBootstrap>
      </MuchakuchaThemeProvider>,
    );
    expect(result.view.queryByText('resolved application')).toBeNull();
    pending.resolve({ kind: 'unauthenticated' });
    expect(await result.view.findByText('resolved application')).toBeTruthy();
  });

  test('restores and publishes an authenticated session before navigation', async () => {
    const outcome = {
      kind: 'authenticated' as const,
      session: { accessToken: 'access-secret', currentUser },
    };
    const result = await renderBootstrap({ outcome });

    await waitFor(() => expect(result.onRoute).toHaveBeenCalledWith('/household-handoff'));
    expect(result.stateAtNavigation).toEqual([
      { destination: '/household-handoff', state: { kind: 'authenticated', session: outcome.session } },
    ]);
  });

  test('routes a no-household account only to the Phase 1 handoff', async () => {
    const result = await renderBootstrap({
      outcome: { kind: 'authenticated', session: { accessToken: 'access-secret', currentUser } },
    });

    await waitFor(() => expect(result.onRoute).toHaveBeenCalledWith('/household-handoff'));
    expect(result.onRoute).not.toHaveBeenCalledWith(expect.stringMatching(/today|household\//i));
  });

  test('restores an allowlisted protected profile route without replacing it with the handoff', async () => {
    const result = await renderBootstrap({
      intendedRoute: '/profile',
      outcome: { kind: 'authenticated', session: { accessToken: 'access-secret', currentUser } },
    });

    await waitFor(() => expect(result.onRoute).toHaveBeenCalledWith('/profile'));
    expect(result.onRoute).not.toHaveBeenCalledWith('/household-handoff');
  });

  test('clears an explicitly rejected credential and enters reauthentication', async () => {
    const result = await renderBootstrap({
      intendedRoute: '/profile',
      outcome: { kind: 'reauthRequired', reason: 'revoked' },
    });

    await waitFor(() => expect(result.sessionTransport.clear).toHaveBeenCalledTimes(1));
    expect(result.sessionStateStore.get()).toEqual({ kind: 'reauthRequired', reason: 'revoked' });
    expect(result.onRoute).toHaveBeenCalledWith('/login', '/profile');
  });

  test.each(['timeout', 'dns', 'offline', 'server-5xx'])(
    'retains credentials and offers retry for %s restoration failure',
    async () => {
      const result = await renderBootstrap({
        outcome: { kind: 'offline', retainedCredential: true },
      });

      expect(await result.view.findByRole('button', { name: '重试连接' })).toBeTruthy();
      expect(result.sessionStateStore.get()).toEqual({
        kind: 'offlineWaiting',
        retainedCredential: true,
      });
      expect(result.sessionTransport.clear).not.toHaveBeenCalled();
      await fireEvent.press(result.view.getByRole('button', { name: '重试连接' }));
      expect(result.sessionTransport.restore).toHaveBeenCalledTimes(2);
    },
  );

  test('preserves only an allowlisted internal intended route', () => {
    expect(sanitizeIntendedRoute('/profile')).toBe('/profile');
    expect(sanitizeIntendedRoute('/household-handoff')).toBe('/household-handoff');
    expect(sanitizeIntendedRoute('/households')).toBe('/households');
    expect(sanitizeIntendedRoute('/households/123e4567-e89b-12d3-a456-426614174000/settings'))
      .toBe('/households/123e4567-e89b-12d3-a456-426614174000/settings');
    expect(sanitizeIntendedRoute('/invite/opaque_token-123')).toBe('/invite/opaque_token-123');
    expect(sanitizeIntendedRoute('https://attacker.test')).toBeUndefined();
    expect(sanitizeIntendedRoute('javascript:alert(1)')).toBeUndefined();
    expect(sanitizeIntendedRoute('//attacker.test')).toBeUndefined();
    expect(sanitizeIntendedRoute('/households/../../profile')).toBeUndefined();
  });
});
