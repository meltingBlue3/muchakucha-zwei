import type { CurrentUserDto } from '@muchakucha/api-client';

import type { GeneratedSessionClient } from '../../api/api-client';

export type ReauthenticationReason = 'expired' | 'revoked' | 'replayed';

export interface LoginCredentials {
  username: string;
  password: string;
}

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
  login(credentials: LoginCredentials): Promise<RestoreOutcome>;
  loadCurrentUser(): Promise<RestoreOutcome>;
  refresh(): Promise<RestoreOutcome>;
  restore(): Promise<RestoreOutcome>;
}

export type NativeSessionRequest = (refreshToken: string) => Promise<IssuedSession>;

export type WebSessionRequest = (options: {
  credentials: 'include';
}) => Promise<IssuedSession>;

export type SessionTransportFactory = (client: GeneratedSessionClient) => SessionTransport;

/**
 * This platform's transport. Metro bundles only `.native.ts`, which keeps the
 * refresh token in SecureStore, or `.web.ts`, which leaves it in an HttpOnly
 * cookie; both export it, and this declaration is what TypeScript checks
 * callers against.
 */
export declare const createSessionTransport: SessionTransportFactory;
