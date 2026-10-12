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
  let generation = 0;
  const sessionApi: SessionApiClient | null =
    typeof source === 'function'
      ? null
      : createSessionApiClient(source, () => accessToken);
  const requestSession: WebSessionRequest =
    typeof source === 'function'
      ? source
      : async () => sessionApi!.refreshWeb();

  const clear = async (): Promise<void> => {
    generation++;
    accessToken = null;
  };

  const acceptIssuedSession = async (
    session: IssuedSession,
    expectedGeneration = ++generation,
  ): Promise<AccessSession> => {
    if (expectedGeneration !== generation) throw new SessionRestoreError({ kind: 'unauthenticated' });
    if (!session.accessToken || session.refreshToken !== undefined) {
      await clear();
      throw new Error('Web sessions must contain only an access token.');
    }
    accessToken = session.accessToken;
    return { accessToken };
  };

  const performRefresh = async (): Promise<RestoreOutcome> => {
    const request = generation;
    try {
      const session = await requestSession({ credentials: 'include' });
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
        await sessionApi.login(credentials, 'web'), request,
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
