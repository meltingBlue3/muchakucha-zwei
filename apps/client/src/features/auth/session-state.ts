import type {
  AccessSession,
  ReauthenticationReason,
} from '../../platform/session/session-transport';

export type SessionState =
  | { kind: 'booting' }
  | { kind: 'authenticated'; session: AccessSession }
  | { kind: 'unauthenticated' }
  | { kind: 'offlineWaiting'; retainedCredential: true }
  | { kind: 'reauthRequired'; reason: ReauthenticationReason };

export interface SessionStateStore {
  get(): SessionState;
  subscribe(listener: (state: SessionState) => void): () => void;
  enterAuthenticated(session: AccessSession): void;
  enterUnauthenticated(): void;
  enterOfflineWaiting(): void;
  enterReauthenticationRequired(reason: ReauthenticationReason): void;
}

export function createSessionStateStore(): SessionStateStore {
  let state: SessionState = { kind: 'booting' };
  const listeners = new Set<(state: SessionState) => void>();
  const setState = (next: SessionState) => {
    state = next;
    for (const listener of listeners) listener(state);
  };

  return {
    get: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    enterAuthenticated: (session) => {
      setState({ kind: 'authenticated', session });
    },
    enterUnauthenticated: () => {
      setState({ kind: 'unauthenticated' });
    },
    enterOfflineWaiting: () => {
      setState({ kind: 'offlineWaiting', retainedCredential: true });
    },
    enterReauthenticationRequired: (reason) => {
      setState({ kind: 'reauthRequired', reason });
    },
  };
}
