import {
  type ApiClient,
  type CurrentUserDto,
  type LoginDto,
} from '@muchakucha/api-client';

import {
  type IssuedSession,
  type LoginCredentials,
  type RestoreFailureOutcome,
} from '../platform/session/session-transport';

export class SessionRestoreError extends Error {
  constructor(readonly outcome: RestoreFailureOutcome) {
    super(`Session restoration failed: ${outcome.kind}`);
    this.name = 'SessionRestoreError';
  }
}

export type GeneratedSessionClient = Pick<
  ApiClient,
  'getMe' | 'login' | 'refresh'
>;

export interface SessionApiClient {
  getCurrentUser(): Promise<CurrentUserDto>;
  login(
    credentials: LoginCredentials,
    platform: LoginDto['platform'],
  ): Promise<IssuedSession>;
  refreshNative(refreshToken: string): Promise<IssuedSession>;
  refreshWeb(): Promise<IssuedSession>;
}

type ApiFailure = { body: unknown; status: number };

function isApiFailure(error: unknown): error is ApiFailure {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number' &&
    'body' in error
  );
}

function apiErrorCode(error: ApiFailure): string | undefined {
  if (typeof error.body !== 'object' || error.body === null || !('error' in error.body)) {
    return undefined;
  }
  const bodyError = error.body.error;
  if (typeof bodyError !== 'object' || bodyError === null || !('code' in bodyError)) {
    return undefined;
  }
  return typeof bodyError.code === 'string' ? bodyError.code : undefined;
}

function mapSessionFailure(error: unknown): never {
  if (error instanceof SessionRestoreError) throw error;
  if (isApiFailure(error)) {
    if (error.status === 400 && apiErrorCode(error) === 'INVALID_REFRESH_TRANSPORT') {
      throw new SessionRestoreError({ kind: 'unauthenticated' });
    }
    if (error.status === 401) {
      const code = apiErrorCode(error);
      throw new SessionRestoreError({
        kind: 'reauthRequired',
        reason:
          code === 'REFRESH_REPLAYED'
            ? 'replayed'
            : code === 'INVALID_REFRESH_TOKEN'
              ? 'expired'
              : 'revoked',
      });
    }
    if (error.status >= 500 || error.status === 408 || error.status === 429) {
      throw new SessionRestoreError({ kind: 'offline', retainedCredential: true });
    }
    throw error;
  }
  if (error instanceof Error && error.name === 'AbortError') throw error;
  throw new SessionRestoreError({ kind: 'offline', retainedCredential: true });
}

async function mapSessionRequest<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    return mapSessionFailure(error);
  }
}

export function createSessionApiClient(
  client: GeneratedSessionClient,
  getAccessToken: () => string | null,
): SessionApiClient {
  return {
    getCurrentUser: async () => {
      const accessToken = getAccessToken();
      if (accessToken === null) {
        throw new SessionRestoreError({
          kind: 'reauthRequired',
          reason: 'expired',
        });
      }
      return mapSessionRequest(() => client.getMe(accessToken));
    },
    login: (credentials, platform) => client.login({ ...credentials, platform }),
    refreshNative: (refreshToken) =>
      mapSessionRequest(() => client.refresh({ refreshToken })),
    refreshWeb: () => mapSessionRequest(() => client.refresh({})),
  };
}
