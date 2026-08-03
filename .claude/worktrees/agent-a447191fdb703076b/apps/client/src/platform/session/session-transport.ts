import type { CurrentUserDto, LoginDto } from '@muchakucha/api-client';

export { SessionRestoreError } from '../../api/api-client';

export type ReauthenticationReason = 'expired' | 'revoked' | 'replayed';

export interface AccessSession {
  accessToken: string;
  currentUser?: CurrentUserDto;
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
  { kind: 'authenticated' }
>;

export interface SessionTransport {
  acceptIssuedSession(session: IssuedSession): Promise<AccessSession>;
  clear(): Promise<void>;
  getAccessToken(): string | null;
  login(credentials: Omit<LoginDto, 'platform'>): Promise<RestoreOutcome>;
  loadCurrentUser(): Promise<RestoreOutcome>;
  refresh(): Promise<RestoreOutcome>;
  restore(): Promise<RestoreOutcome>;
}

export type NativeSessionRequest = (refreshToken: string) => Promise<IssuedSession>;

export type WebSessionRequest = (options: {
  credentials: 'include';
}) => Promise<IssuedSession>;
