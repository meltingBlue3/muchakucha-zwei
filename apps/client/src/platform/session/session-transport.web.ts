import {
  createSessionApiClient,
  SessionRestoreError,
  type GeneratedSessionClient,
  type SessionApiClient,
} from '../../api/api-client';
import {
  createRefreshCoordinator,
  createWebRefreshLock,
} from '../../api/refresh-coordinator';

import {
  type AccessSession,
  type IssuedSession,
  type RestoreOutcome,
  type SessionTransport,
  type WebSessionRequest,
} from './session-transport';

const REFRESH_LOCK_NAME = 'muchakucha-session-refresh';

const refreshCoordinator = createRefreshCoordinator(
  createWebRefreshLock(REFRESH_LOCK_NAME),
);

type WebSessionSource = GeneratedSessionClient | WebSessionRequest;

export function createWebSessionTransport(
  source: WebSessionSource,
): SessionTransport {
  let accessToken: string | null = null;
  const sessionApi: SessionApiClient | null =
    typeof source === 'function'
      ? null
      : createSessionApiClient(source, () => accessToken);
  const requestSession: WebSessionRequest =
    typeof source === 'function'
      ? source
      : async () => sessionApi!.refreshWeb();

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
        await sessionApi.login(credentials, 'web'),
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
