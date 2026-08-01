import * as SecureStore from 'expo-secure-store';
import { ApiClient } from '@muchakucha/api-client';

import { createSessionStateStore } from '../../../features/auth/session-state';
import { pendingProofStore } from '../pending-proof.native';
import { pendingProofTransport } from '../pending-proof.web';
import { createNativeSessionTransport } from '../session-transport.native';
import { createWebSessionTransport } from '../session-transport.web';

const apiResponse = (status: number, body: unknown) => ({
  json: jest.fn().mockResolvedValue(body),
  ok: status >= 200 && status < 300,
  status,
  text: jest.fn().mockResolvedValue(body === undefined ? '' : JSON.stringify(body)),
});

describe('platform session transport contract', () => {
  test('native stores pending proof only in its namespaced SecureStore slot', async () => {
    await pendingProofStore.write('pending-proof');

    await expect(pendingProofStore.read()).resolves.toBe('pending-proof');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'muchakucha.session.pending-proof.v1',
      'pending-proof',
    );

    await pendingProofStore.clear();
    await pendingProofStore.clear();
    await expect(pendingProofStore.read()).resolves.toBeNull();
  });

  test('native persists refresh before publishing memory-only access', async () => {
    const transport = createNativeSessionTransport(jest.fn());
    jest.mocked(SecureStore.setItemAsync).mockImplementationOnce(async () => {
      expect(transport.getAccessToken()).toBeNull();
    });

    await expect(
      transport.acceptIssuedSession({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
    ).resolves.toEqual({ accessToken: 'access-token' });

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'muchakucha.session.refresh.v1',
      'refresh-token',
    );
    expect(transport.getAccessToken()).toBe('access-token');
  });

  test('native rolls back every credential when durable acceptance fails', async () => {
    const transport = createNativeSessionTransport(jest.fn());
    jest
      .mocked(SecureStore.setItemAsync)
      .mockRejectedValueOnce(new Error('secure storage unavailable'));

    await expect(
      transport.acceptIssuedSession({
        accessToken: 'must-not-publish',
        refreshToken: 'must-not-retain',
      }),
    ).rejects.toThrow('secure storage unavailable');

    expect(transport.getAccessToken()).toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      'muchakucha.session.refresh.v1',
    );
  });

  test('native refresh is single-flight and accepts the rotated generation', async () => {
    await SecureStore.setItemAsync(
      'muchakucha.session.refresh.v1',
      'generation-one',
    );
    let resolveRequest: ((value: { accessToken: string; refreshToken: string }) => void) | undefined;
    const request = jest.fn(
      () =>
        new Promise<{ accessToken: string; refreshToken: string }>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const first = createNativeSessionTransport(request);
    const second = createNativeSessionTransport(request);

    const firstRefresh = first.refresh();
    const secondRefresh = second.refresh();
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(1);
    resolveRequest?.({ accessToken: 'rotated-access', refreshToken: 'generation-two' });

    await expect(firstRefresh).resolves.toEqual({
      kind: 'authenticated',
      session: { accessToken: 'rotated-access' },
    });
    await expect(secondRefresh).resolves.toEqual({
      kind: 'authenticated',
      session: { accessToken: 'rotated-access' },
    });
    expect(SecureStore.setItemAsync).toHaveBeenLastCalledWith(
      'muchakucha.session.refresh.v1',
      'generation-two',
    );
  });

  test('Web exposes credentialed transport but no proof secret accessor', () => {
    expect(pendingProofTransport).toEqual({ credentials: 'include' });
    expect(Object.keys(pendingProofTransport).sort()).toEqual(['credentials']);
  });

  test('Web sends cookie credentials and retains only access in memory', async () => {
    const request = jest.fn().mockResolvedValue({ accessToken: 'web-access' });
    const transport = createWebSessionTransport(request);

    await expect(transport.restore()).resolves.toEqual({
      kind: 'authenticated',
      session: { accessToken: 'web-access' },
    });
    expect(request).toHaveBeenCalledWith({ credentials: 'include' });
    expect(transport.getAccessToken()).toBe('web-access');
    await expect(
      transport.acceptIssuedSession({
        accessToken: 'unsafe',
        refreshToken: 'must-stay-http-only',
      }),
    ).rejects.toThrow('only an access token');
    expect(transport.getAccessToken()).toBeNull();
  });

  test('Web refresh uses an in-tab single flight fallback', async () => {
    let resolveRequest: ((value: { accessToken: string }) => void) | undefined;
    const request = jest.fn(
      () =>
        new Promise<{ accessToken: string }>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const transport = createWebSessionTransport(request);

    const first = transport.refresh();
    const second = transport.refresh();
    expect(request).toHaveBeenCalledTimes(1);
    resolveRequest?.({ accessToken: 'web-access' });
    await expect(first).resolves.toEqual({
      kind: 'authenticated',
      session: { accessToken: 'web-access' },
    });
    await expect(second).resolves.toEqual({
      kind: 'authenticated',
      session: { accessToken: 'web-access' },
    });
  });

  test('Web refresh takes the same-origin Web Lock when it is available', async () => {
    const requestLock = jest.fn(
      async <T>(_name: string, callback: () => Promise<T>): Promise<T> => callback(),
    );
    Object.defineProperty(globalThis.navigator, 'locks', {
      configurable: true,
      value: { request: requestLock },
    });
    const transport = createWebSessionTransport(
      jest.fn().mockResolvedValue({ accessToken: 'locked-access' }),
    );

    await expect(transport.refresh()).resolves.toMatchObject({
      kind: 'authenticated',
    });
    expect(requestLock).toHaveBeenCalledWith(
      'muchakucha-session-refresh',
      expect.any(Function),
    );

    Reflect.deleteProperty(globalThis.navigator, 'locks');
  });

  test('clear is idempotent and removes the matching platform credential', async () => {
    const native = createNativeSessionTransport(jest.fn());
    const web = createWebSessionTransport(jest.fn());

    await native.acceptIssuedSession({
      accessToken: 'native-access',
      refreshToken: 'native-refresh',
    });
    await web.acceptIssuedSession({ accessToken: 'web-access' });
    await native.clear();
    await native.clear();
    await web.clear();
    await web.clear();

    expect(native.getAccessToken()).toBeNull();
    expect(web.getAccessToken()).toBeNull();
    await expect(
      SecureStore.getItemAsync('muchakucha.session.refresh.v1'),
    ).resolves.toBeNull();
  });

  test('session state distinguishes authenticated, offline, and reauthentication states', () => {
    const state = createSessionStateStore();
    expect(state.get()).toEqual({ kind: 'booting' });
    state.enterOfflineWaiting();
    expect(state.get()).toEqual({ kind: 'offlineWaiting', retainedCredential: true });
    state.enterReauthenticationRequired('replayed');
    expect(state.get()).toEqual({ kind: 'reauthRequired', reason: 'replayed' });
    state.enterAuthenticated({ accessToken: 'access' });
    expect(state.get()).toEqual({
      kind: 'authenticated',
      session: { accessToken: 'access' },
    });
    state.enterUnauthenticated();
    expect(state.get()).toEqual({ kind: 'unauthenticated' });
  });

  test('platform adapters never reference forbidden browser-readable storage', () => {
    const adapterSources = [
      pendingProofStore.read,
      pendingProofStore.write,
      createNativeSessionTransport,
      createWebSessionTransport,
    ]
      .map(String)
      .join('\n');

    expect(adapterSources).not.toContain('AsyncStorage');
    expect(adapterSources).not.toContain('localStorage');
  });

  test('native uses generated body refresh, persists rotation, then fetches users/me', async () => {
    await SecureStore.setItemAsync('muchakucha.session.refresh.v1', 'generation-one');
    const fetchMock = jest.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        apiResponse(200, {
          accessToken: 'rotated-access',
          refreshToken: 'generation-two',
        }) as never,
      )
      .mockImplementationOnce(async (_input, init) => {
        expect(SecureStore.setItemAsync).toHaveBeenLastCalledWith(
          'muchakucha.session.refresh.v1',
          'generation-two',
        );
        expect(init?.headers).toEqual(
          expect.objectContaining({ authorization: 'Bearer rotated-access' }),
        );
        return apiResponse(200, {
          id: 'user-1',
          email: 'member@example.test',
          displayName: 'Member',
          emailVerified: true,
          hasHousehold: false,
        }) as never;
      });
    const transport = createNativeSessionTransport(
      new ApiClient('https://api.example.test') as never,
    );

    await expect(transport.restore()).resolves.toMatchObject({
      kind: 'authenticated',
      session: {
        accessToken: 'rotated-access',
        currentUser: { id: 'user-1' },
      },
    });
    expect(fetchMock.mock.calls[0]).toEqual([
      'https://api.example.test/api/v1/auth/refresh',
      expect.objectContaining({
        body: JSON.stringify({ refreshToken: 'generation-one' }),
        credentials: 'include',
      }),
    ]);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://api.example.test/api/v1/users/me',
    );
  });

  test('Web uses generated credentialed cookie refresh without a readable secret', async () => {
    const fetchMock = jest.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(apiResponse(200, { accessToken: 'web-access' }) as never)
      .mockResolvedValueOnce(
        apiResponse(200, {
          id: 'user-1',
          email: 'member@example.test',
          displayName: 'Member',
          emailVerified: true,
          hasHousehold: false,
        }) as never,
      );
    const transport = createWebSessionTransport(
      new ApiClient('https://api.example.test') as never,
    );

    await expect(transport.restore()).resolves.toMatchObject({
      kind: 'authenticated',
      session: { currentUser: { id: 'user-1' } },
    });
    expect(fetchMock.mock.calls[0]).toEqual([
      'https://api.example.test/api/v1/auth/refresh',
      expect.objectContaining({
        body: JSON.stringify({}),
        credentials: 'include',
      }),
    ]);
    expect(Object.keys(transport).sort()).not.toEqual(
      expect.arrayContaining(['getRefreshToken', 'setRefreshToken']),
    );
  });

  test('login uses the generated platform operation and loads users/me after acceptance', async () => {
    const fetchMock = jest.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        apiResponse(200, {
          accessToken: 'login-access',
          refreshToken: 'login-refresh',
        }) as never,
      )
      .mockResolvedValueOnce(
        apiResponse(200, {
          id: 'user-1',
          email: 'member@example.test',
          displayName: 'Member',
          emailVerified: true,
          hasHousehold: false,
        }) as never,
      );
    const transport = createNativeSessionTransport(
      new ApiClient('https://api.example.test'),
    );

    await expect(
      transport.login({ email: 'member@example.test', password: 'correct horse' }),
    ).resolves.toMatchObject({
      kind: 'authenticated',
      session: { accessToken: 'login-access', currentUser: { id: 'user-1' } },
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.example.test/api/v1/auth/login',
    );
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({
        email: 'member@example.test',
        password: 'correct horse',
        platform: 'native',
      }),
    );
  });

  test('users/me rejection permits exactly one serialized refresh retry', async () => {
    const fetchMock = jest.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        apiResponse(401, { error: { code: 'INVALID_ACCESS_TOKEN' } }) as never,
      )
      .mockResolvedValueOnce(
        apiResponse(200, {
          accessToken: 'retry-access',
          refreshToken: 'retry-refresh',
        }) as never,
      )
      .mockResolvedValueOnce(
        apiResponse(200, {
          id: 'user-1',
          email: 'member@example.test',
          displayName: 'Member',
          emailVerified: true,
          hasHousehold: false,
        }) as never,
      );
    const transport = createNativeSessionTransport(
      new ApiClient('https://api.example.test'),
    );
    await transport.acceptIssuedSession({
      accessToken: 'stale-access',
      refreshToken: 'current-refresh',
    });

    await expect(transport.loadCurrentUser()).resolves.toMatchObject({
      kind: 'authenticated',
      session: { accessToken: 'retry-access', currentUser: { id: 'user-1' } },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('maps replay rejection to reauthentication and clears the native credential', async () => {
    await SecureStore.setItemAsync('muchakucha.session.refresh.v1', 'replayed-token');
    jest.mocked(fetch).mockResolvedValueOnce(
      apiResponse(401, {
        error: { code: 'REFRESH_REPLAYED', message: 'Refresh token replay detected.' },
      }) as never,
    );
    const transport = createNativeSessionTransport(
      new ApiClient('https://api.example.test') as never,
    );

    await expect(transport.restore()).resolves.toEqual({
      kind: 'reauthRequired',
      reason: 'replayed',
    });
    await expect(
      SecureStore.getItemAsync('muchakucha.session.refresh.v1'),
    ).resolves.toBeNull();
  });

  test.each([
    ['network', new TypeError('Network request failed')],
    ['server', apiResponse(503, { error: { code: 'UNAVAILABLE' } })],
  ])('retains native refresh on %s failure', async (_case, failure) => {
    await SecureStore.setItemAsync('muchakucha.session.refresh.v1', 'retained-token');
    if (failure instanceof Error) jest.mocked(fetch).mockRejectedValueOnce(failure);
    else jest.mocked(fetch).mockResolvedValueOnce(failure as never);
    const transport = createNativeSessionTransport(
      new ApiClient('https://api.example.test') as never,
    );

    await expect(transport.restore()).resolves.toEqual({
      kind: 'offline',
      retainedCredential: true,
    });
    await expect(
      SecureStore.getItemAsync('muchakucha.session.refresh.v1'),
    ).resolves.toBe('retained-token');
  });
});
