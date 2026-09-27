import { ApiClientError } from '@muchakucha/api-client';

import type { RestoreOutcome } from '../platform/session/session-transport';

export interface RetrySession {
  getAccessToken(): string | null;
  /** Coordinated refresh: concurrent callers share one request. */
  refresh(): Promise<RestoreOutcome>;
  /** The refresh credential is gone; the user has to sign in again. */
  onSessionLost(outcome: Extract<RestoreOutcome, { kind: 'reauthRequired' | 'unauthenticated' }>): void;
}

/**
 * Access tokens live 15 minutes, so a page left idle (or an app resumed from
 * the background) holds an expired one. Every authenticated generated-client
 * method takes the access token first; when such a call answers 401, this
 * refreshes once and retries with the new token instead of surfacing the 401
 * as a load failure. A token another call already refreshed is reused.
 */
export function withSessionRetry<T extends object>(client: T, session: RetrySession): T {
  return new Proxy(client, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      const method = value as (...args: unknown[]) => Promise<unknown>;
      return async (...args: unknown[]) => {
        try {
          return await method.apply(target, args);
        } catch (error) {
          const used = args[0];
          if (!(error instanceof ApiClientError) || error.status !== 401 || typeof used !== 'string') throw error;
          let token = session.getAccessToken();
          if (token === null || token === used) {
            const outcome = await session.refresh();
            if (outcome.kind === 'reauthRequired' || outcome.kind === 'unauthenticated') {
              session.onSessionLost(outcome);
              throw error;
            }
            if (outcome.kind !== 'authenticated') throw error;
            token = outcome.session.accessToken;
          }
          return method.apply(target, [token, ...args.slice(1)]);
        }
      };
    },
  });
}
