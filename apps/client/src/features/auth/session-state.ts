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
  enterAuthenticated(session: AccessSession): void;
  enterUnauthenticated(): void;
  enterOfflineWaiting(): void;
  enterReauthenticationRequired(reason: ReauthenticationReason): void;
}
