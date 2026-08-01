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
  const sessionApi: SessionApiClient | null =
    typeof source === 'function'
      ? null
      : createSessionApiClient(source, () => accessToken);
  const requestSession: NativeSessionRequest =
    typeof source === 'function' ? source : sessionApi!.refreshNative;

  const clear = async (): Promise<void> => {
    accessToken = null;
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  };

  const acceptIssuedSession = async (
    session: IssuedSession,
  ): Promise<AccessSession> => {
    if (!session.accessToken || !session.refreshToken) {
      await clear();
      throw new Error('Native issued sessions require access and refresh tokens.');
    }

    try {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, session.refreshToken);
      accessToken = session.accessToken;
      return { accessToken };
    } catch (error) {
      accessToken = null;
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => undefined);
      throw error;
    }
  };

  const performRefresh = async (): Promise<RestoreOutcome> => {
    const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      accessToken = null;
      return { kind: 'unauthenticated' };
    }

    try {
      const session = await requestSession(refreshToken);
      const accepted = await acceptIssuedSession(session);
      return {
        kind: 'authenticated',
        session:
          sessionApi === null
            ? accepted
            : { ...accepted, currentUser: await sessionApi.getCurrentUser() },
      };
    } catch (error) {
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
    try {
      const accepted = await acceptIssuedSession(
        await sessionApi.login(credentials, 'native'),
      );
      return {
        kind: 'authenticated',
        session: { ...accepted, currentUser: await sessionApi.getCurrentUser() },
      };
    } catch (error) {
      if (error instanceof SessionRestoreError) return error.outcome;
      throw error;
    }
  };

  const loadCurrentUser = async (): Promise<RestoreOutcome> => {
    if (sessionApi === null) return refresh();
    if (accessToken === null) return refresh();
    try {
      return {
        kind: 'authenticated',
        session: { accessToken, currentUser: await sessionApi.getCurrentUser() },
      };
    } catch (error) {
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
