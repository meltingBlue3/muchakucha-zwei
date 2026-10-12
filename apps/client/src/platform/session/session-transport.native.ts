import * as SecureStore from 'expo-secure-store';

import {
  createSessionApiClient,
  SessionRestoreError,
  type GeneratedSessionClient,
  type SessionApiClient,
} from '../../api/api-client';
import { createRefreshCoordinator } from '../../api/refresh-coordinator';

import {
  type AccessSession,
  type IssuedSession,
  type NativeSessionRequest,
  type RestoreOutcome,
  type SessionTransport,
} from './session-transport';

const REFRESH_TOKEN_KEY = 'muchakucha.session.refresh.v1';

const refreshCoordinator = createRefreshCoordinator();

type NativeSessionSource = GeneratedSessionClient | NativeSessionRequest;

export function createNativeSessionTransport(
  source: NativeSessionSource,
): SessionTransport {
  let accessToken: string | null = null;
  let generation = 0;
  const sessionApi: SessionApiClient | null =
    typeof source === 'function'
      ? null
      : createSessionApiClient(source, () => accessToken);
  const requestSession: NativeSessionRequest =
    typeof source === 'function' ? source : sessionApi!.refreshNative;

  // Serialize durable writes with logout so a pending write cannot restore a cleared credential.
  let credentialWrite = Promise.resolve();
  const writeCredential = (write: () => Promise<void>): Promise<void> => {
    const next = credentialWrite.then(write, write);
    credentialWrite = next.catch(() => undefined);
    return next;
  };

  const clear = async (): Promise<void> => {
    generation++;
    accessToken = null;
    await writeCredential(() => SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY));
  };

  const acceptIssuedSession = async (
    session: IssuedSession,
    expectedGeneration = ++generation,
  ): Promise<AccessSession> => {
    if (expectedGeneration !== generation) throw new SessionRestoreError({ kind: 'unauthenticated' });
    if (!session.accessToken || !session.refreshToken) {
      await clear();
      throw new Error('Native issued sessions require access and refresh tokens.');
    }

    try {
      const refreshToken = session.refreshToken;
      await writeCredential(async () => {
        if (expectedGeneration === generation) await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
      });
      if (expectedGeneration !== generation) throw new SessionRestoreError({ kind: 'unauthenticated' });
      accessToken = session.accessToken;
      return { accessToken };
    } catch (error) {
      if (expectedGeneration === generation) {
        accessToken = null;
        await writeCredential(() => SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY)).catch(() => undefined);
      }
      throw error;
    }
  };

  const performRefresh = async (): Promise<RestoreOutcome> => {
    const request = generation;
    const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    if (request !== generation) return { kind: 'unauthenticated' };
    if (!refreshToken) {
      accessToken = null;
      return { kind: 'unauthenticated' };
    }

    try {
      const session = await requestSession(refreshToken);
      if (request !== generation) return { kind: 'unauthenticated' };
      const accepted = await acceptIssuedSession(session, request);
      const currentUser = sessionApi === null ? undefined : await sessionApi.getCurrentUser();
      if (request !== generation) return { kind: 'unauthenticated' };
      return {
        kind: 'authenticated',
        session:
          sessionApi === null
            ? accepted
            : { ...accepted, currentUser: currentUser! },
      };
    } catch (error) {
      if (request !== generation) return { kind: 'unauthenticated' };
      if (error instanceof SessionRestoreError) {
        if (error.outcome.kind === 'reauthRequired') {
          await clear();
        }
        return error.outcome;
      }
      throw error;
    }
  };

  const refresh = (): Promise<RestoreOutcome> => {
    return refreshCoordinator.run(performRefresh);
  };

  const login = async (
    credentials: Parameters<SessionTransport['login']>[0],
  ): Promise<RestoreOutcome> => {
    if (sessionApi === null) {
      throw new Error('Login requires the generated session API client.');
    }
    const request = ++generation;
    try {
      const accepted = await acceptIssuedSession(
        await sessionApi.login(credentials, 'native'), request,
      );
      const currentUser = await sessionApi.getCurrentUser();
      if (request !== generation) return { kind: 'unauthenticated' };
      return {
        kind: 'authenticated',
        session: { ...accepted, currentUser },
      };
    } catch (error) {
      if (request !== generation) return { kind: 'unauthenticated' };
      if (error instanceof SessionRestoreError) return error.outcome;
      throw error;
    }
  };

  const loadCurrentUser = async (): Promise<RestoreOutcome> => {
    if (sessionApi === null) return refresh();
    if (accessToken === null) return refresh();
    const request = generation;
    try {
      const currentUser = await sessionApi.getCurrentUser();
      if (request !== generation || accessToken === null) return { kind: 'unauthenticated' };
      return {
        kind: 'authenticated',
        session: { accessToken, currentUser },
      };
    } catch (error) {
      if (request !== generation) return { kind: 'unauthenticated' };
      if (error instanceof SessionRestoreError) {
        return error.outcome.kind === 'reauthRequired' ? refresh() : error.outcome;
      }
      throw error;
    }
  };

  return {
    acceptIssuedSession,
    clear,
    getAccessToken: () => accessToken,
    loadCurrentUser,
    login,
    refresh,
    restore: refresh,
  };
}
