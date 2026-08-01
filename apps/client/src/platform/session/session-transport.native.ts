import * as SecureStore from 'expo-secure-store';

import {
  SessionRestoreError,
  type AccessSession,
  type IssuedSession,
  type NativeSessionRequest,
  type RestoreOutcome,
  type SessionTransport,
} from './session-transport';

const REFRESH_TOKEN_KEY = 'muchakucha.session.refresh.v1';

let refreshInFlight: Promise<RestoreOutcome> | null = null;

export function createNativeSessionTransport(
  requestSession: NativeSessionRequest,
): SessionTransport {
  let accessToken: string | null = null;

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
      return {
        kind: 'authenticated',
        session: await acceptIssuedSession(session),
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
    if (!refreshInFlight) {
      refreshInFlight = performRefresh().finally(() => {
        refreshInFlight = null;
      });
    }
    return refreshInFlight;
  };

  return {
    acceptIssuedSession,
    clear,
    getAccessToken: () => accessToken,
    refresh,
    restore: refresh,
  };
}
