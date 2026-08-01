import {
  SessionRestoreError,
  type AccessSession,
  type IssuedSession,
  type RestoreOutcome,
  type SessionTransport,
  type WebSessionRequest,
} from './session-transport';

const REFRESH_LOCK_NAME = 'muchakucha-session-refresh';

let refreshInFlight: Promise<RestoreOutcome> | null = null;

export function createWebSessionTransport(
  requestSession: WebSessionRequest,
): SessionTransport {
  let accessToken: string | null = null;

  const clear = async (): Promise<void> => {
    accessToken = null;
  };

  const acceptIssuedSession = async (
    session: IssuedSession,
  ): Promise<AccessSession> => {
    if (!session.accessToken || session.refreshToken !== undefined) {
      await clear();
      throw new Error('Web sessions must contain only an access token.');
    }
    accessToken = session.accessToken;
    return { accessToken };
  };

  const performRefresh = async (): Promise<RestoreOutcome> => {
    try {
      const session = await requestSession({ credentials: 'include' });
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

  const withWebLock = async (): Promise<RestoreOutcome> => {
    const locks = globalThis.navigator?.locks;
    return locks
      ? await locks.request(REFRESH_LOCK_NAME, performRefresh)
      : performRefresh();
  };

  const refresh = (): Promise<RestoreOutcome> => {
    if (!refreshInFlight) {
      refreshInFlight = withWebLock().finally(() => {
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
