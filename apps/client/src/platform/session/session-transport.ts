export type ReauthenticationReason = 'expired' | 'revoked' | 'replayed';

export interface AccessSession {
  accessToken: string;
}

export interface IssuedSession extends AccessSession {
  refreshToken?: string;
}

export type RestoreOutcome =
  | { kind: 'authenticated'; session: AccessSession }
  | { kind: 'unauthenticated' }
  | { kind: 'offline'; retainedCredential: true }
  | { kind: 'reauthRequired'; reason: ReauthenticationReason };

export type RestoreFailureOutcome = Exclude<
  RestoreOutcome,
  { kind: 'authenticated' } | { kind: 'unauthenticated' }
>;

export class SessionRestoreError extends Error {
  constructor(readonly outcome: RestoreFailureOutcome) {
    super(`Session restoration failed: ${outcome.kind}`);
    this.name = 'SessionRestoreError';
  }
}

export interface SessionTransport {
  acceptIssuedSession(session: IssuedSession): Promise<AccessSession>;
  clear(): Promise<void>;
  getAccessToken(): string | null;
  refresh(): Promise<RestoreOutcome>;
  restore(): Promise<RestoreOutcome>;
}

export type NativeSessionRequest = (refreshToken: string) => Promise<IssuedSession>;

export type WebSessionRequest = (options: {
  credentials: 'include';
}) => Promise<IssuedSession>;
