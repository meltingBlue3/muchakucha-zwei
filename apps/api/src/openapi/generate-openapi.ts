import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createApplication, createOpenApiDocument } from '../main.js';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const packageRoot = resolve(repositoryRoot, 'packages/api-client');
const generatedRoot = resolve(packageRoot, 'src/generated');

const modelsSource = `// Generated from openapi.json. Do not edit.
export interface RegisterDto {
  email: string;
  displayName: string;
  password: string;
  platform: 'native' | 'web';
}

export interface RegistrationAcceptedDto {
  code: 'REGISTRATION_ACCEPTED';
  /** Native-only pending proof. Web responses omit this property. */
  pendingProof?: string;
}

export interface LoginDto {
  email: string;
  password: string;
  platform: 'native' | 'web';
}

export interface LoginResponseDto {
  accessToken: string;
  /** Native-only refresh credential. Web responses omit this property. */
  refreshToken?: string;
}

export interface RefreshDto {
  /** Native-only refresh credential. Web requests omit this property. */
  refreshToken?: string;
}

export interface RefreshResponseDto {
  accessToken: string;
  /** Native-only rotated refresh credential. Web responses omit this property. */
  refreshToken?: string;
}

export interface UpdateMeDto {
  displayName: string;
}

export interface CurrentUserDto {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  hasHousehold: false;
}

export interface CompleteEmailVerificationDto {
  token: string;
  platform?: 'native';
  pendingProof?: string;
}

export type VerificationOutcome =
  | 'verified_auto_login'
  | 'verified_login_required'
  | 'expired'
  | 'used'
  | 'invalid'
  | 'superseded';

export interface CompleteEmailVerificationResponseDto {
  outcome: VerificationOutcome;
  accessToken?: string;
  /** Native-only refresh credential. Web responses omit this property. */
  refreshToken?: string;
}

export interface ResendEmailVerificationDto {
  email: string;
}

export interface ResendEmailVerificationResponseDto {
  code: 'RESEND_ACCEPTED';
  retryAfterSeconds: number;
}

export interface RequestPasswordResetDto {
  email: string;
}

export interface PasswordResetRequestAcceptedDto {
  code: 'PASSWORD_RESET_REQUEST_ACCEPTED';
}

export interface CompletePasswordResetDto {
  token: string;
  password: string;
}

export interface CreateHouseholdDto {
  /** 1–40 Unicode code points after trim and NFC normalization. */
  name: string;
}

export interface UpdateHouseholdDto {
  /** 1–40 Unicode code points after trim and NFC normalization. */
  name: string;
}

export interface MembershipResponseDto {
  id: string;
  userId: string;
  householdId: string;
  role: 'ADMIN' | 'MEMBER';
}

export interface CreateHouseholdResponseDto {
  id: string;
  name: string;
  ownerMembershipId: string;
  createdAt: string;
  membership: MembershipResponseDto;
}

export interface ListMyHouseholdsItemDto {
  id: string;
  name: string;
  role: 'ADMIN' | 'MEMBER';
  memberCount: number;
  ownerMembershipId: string;
}

export interface GetHouseholdMemberDto {
  membershipId: string;
  userId: string;
  displayName: string;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  isCurrentUser: boolean;
}

export interface GetHouseholdResponseDto {
  id: string;
  name: string;
  ownerMembershipId: string;
  createdAt: string;
  members: GetHouseholdMemberDto[];
}

export interface SendHouseholdInvitationDto {
  /** Canonical invited email address. Role is server-fixed to MEMBER per D-05. */
  email: string;
}

export interface SendHouseholdInvitationResponseDto {
  code: 'INVITATION_SENT';
  message: string;
}

export interface InvitationPreviewResponseDto {
  kind: 'valid' | 'invalid' | 'expired' | 'used';
  householdName?: string;
  inviterDisplayName?: string;
  expiresAt?: string;
}

export interface AcceptInvitationDto {
  token: string;
}

export interface InvitationListItemDto {
  id: string;
  emailCanonical: string;
  status: 'pending' | 'expired' | 'accepted' | 'revoked';
  expiresAt: string;
  role: string;
  createdAt: string;
}

export interface ListInvitationsResponseDto {
  invitations: InvitationListItemDto[];
}

export interface ResendInvitationResponseDto {
  code: 'INVITATION_RESENT';
  message: string;
}

export interface RevokeInvitationResponseDto {
  code: 'INVITATION_REVOKED';
  message: string;
}

export interface ChangeMemberRoleDto {
  role: 'ADMIN' | 'MEMBER';
}
`;

const clientSource = `// Generated from openapi.json. Do not edit.
import type {
  CompleteEmailVerificationDto,
  CompleteEmailVerificationResponseDto,
  CreateHouseholdDto,
  CreateHouseholdResponseDto,
  GetHouseholdResponseDto,
  ListMyHouseholdsItemDto,
  LoginDto,
  LoginResponseDto,
  RefreshDto,
  RefreshResponseDto,
  UpdateMeDto,
  CurrentUserDto,
  ResendEmailVerificationDto,
  ResendEmailVerificationResponseDto,
  RequestPasswordResetDto,
  PasswordResetRequestAcceptedDto,
  CompletePasswordResetDto,
  UpdateHouseholdDto,
  SendHouseholdInvitationDto,
  SendHouseholdInvitationResponseDto,
  InvitationPreviewResponseDto,
  AcceptInvitationDto,
  InvitationListItemDto,
  ListInvitationsResponseDto,
  ResendInvitationResponseDto,
  RevokeInvitationResponseDto,
  ChangeMemberRoleDto,
} from './models';

export class ApiClientError extends Error {
  constructor(readonly status: number, readonly body: unknown) {
    super(\`API request failed with status \${status}.\`);
    this.name = 'ApiClientError';
  }
}

export class ApiClient {
  constructor(private readonly baseUrl: string) {}

  async register(body: RegisterDto, signal?: AbortSignal): Promise<RegistrationAcceptedDto> {
    const response = await fetch(\`\${this.baseUrl}/api/v1/auth/register\`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      ...(signal === undefined ? {} : { signal }),
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      throw new ApiClientError(response.status, payload);
    }
    return payload as RegistrationAcceptedDto;
  }

  async login(body: LoginDto, signal?: AbortSignal): Promise<LoginResponseDto> {
    return this.post('/api/v1/auth/login', body, signal);
  }

  async refresh(body: RefreshDto = {}, signal?: AbortSignal): Promise<RefreshResponseDto> {
    return this.post('/api/v1/auth/refresh', body, signal);
  }

  async logout(accessToken: string, signal?: AbortSignal): Promise<void> {
    await this.authenticated<void>('POST', '/api/v1/auth/logout', accessToken, undefined, signal);
  }

  async getMe(accessToken: string, signal?: AbortSignal): Promise<CurrentUserDto> {
    return this.authenticated<CurrentUserDto>('GET', '/api/v1/users/me', accessToken, undefined, signal);
  }

  async updateMe(
    accessToken: string,
    body: UpdateMeDto,
    signal?: AbortSignal,
  ): Promise<CurrentUserDto> {
    return this.authenticated<CurrentUserDto>('PATCH', '/api/v1/users/me', accessToken, body, signal);
  }

  async completeEmailVerification(
    body: CompleteEmailVerificationDto,
    signal?: AbortSignal,
  ): Promise<CompleteEmailVerificationResponseDto> {
    return this.post('/api/v1/auth/email-verifications/complete', body, signal);
  }

  async resendEmailVerification(
    body: ResendEmailVerificationDto,
    signal?: AbortSignal,
  ): Promise<ResendEmailVerificationResponseDto> {
    return this.post('/api/v1/auth/email-verifications/resend', body, signal);
  }

  async requestPasswordReset(
    body: RequestPasswordResetDto,
    signal?: AbortSignal,
  ): Promise<PasswordResetRequestAcceptedDto> {
    return this.post('/api/v1/auth/password-reset/request', body, signal);
  }

  async completePasswordReset(body: CompletePasswordResetDto, signal?: AbortSignal): Promise<void> {
    const response = await fetch(
      \`\${this.baseUrl}/api/v1/auth/password-reset/complete\`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        ...(signal === undefined ? {} : { signal }),
      },
    );
    if (!response.ok) {
      const text = await response.text();
      throw new ApiClientError(response.status, text === '' ? undefined : JSON.parse(text));
    }
  }

  async createHousehold(
    accessToken: string,
    body: CreateHouseholdDto,
    signal?: AbortSignal,
  ): Promise<CreateHouseholdResponseDto> {
    return this.authenticated<CreateHouseholdResponseDto>(
      'POST',
      '/api/v1/households',
      accessToken,
      body,
      signal,
    );
  }

  async listMyHouseholds(
    accessToken: string,
    signal?: AbortSignal,
  ): Promise<ListMyHouseholdsItemDto[]> {
    return this.authenticated<ListMyHouseholdsItemDto[]>(
      'GET',
      '/api/v1/households',
      accessToken,
      undefined,
      signal,
    );
  }

  async getHousehold(
    accessToken: string,
    householdId: string,
    signal?: AbortSignal,
  ): Promise<GetHouseholdResponseDto> {
    return this.authenticated<GetHouseholdResponseDto>(
      'GET',
      \`/api/v1/households/\${encodeURIComponent(householdId)}\`,
      accessToken,
      undefined,
      signal,
    );
  }

  async updateHousehold(
    accessToken: string,
    householdId: string,
    body: UpdateHouseholdDto,
    signal?: AbortSignal,
  ): Promise<GetHouseholdResponseDto> {
    return this.authenticated<GetHouseholdResponseDto>(
      'PATCH',
      \`/api/v1/households/\${encodeURIComponent(householdId)}\`,
      accessToken,
      body,
      signal,
    );
  }

  async sendHouseholdInvitation(
    accessToken: string,
    householdId: string,
    body: SendHouseholdInvitationDto,
    signal?: AbortSignal,
  ): Promise<SendHouseholdInvitationResponseDto> {
    return this.authenticated<SendHouseholdInvitationResponseDto>(
      'POST',
      \`/api/v1/households/\${encodeURIComponent(householdId)}/invitations\`,
      accessToken,
      body,
      signal,
    );
  }

  async previewInvitation(token: string, signal?: AbortSignal): Promise<InvitationPreviewResponseDto> {
    const response = await fetch(
      \`\${this.baseUrl}/api/v1/households/invitations/preview?token=\${encodeURIComponent(token)}\`,
      {
        method: 'GET',
        credentials: 'include',
        ...(signal === undefined ? {} : { signal }),
      },
    );
    const payload: unknown = await response.json();
    if (!response.ok) {
      throw new ApiClientError(response.status, payload);
    }
    return payload as InvitationPreviewResponseDto;
  }

  async acceptInvitation(
    accessToken: string,
    body: AcceptInvitationDto,
    signal?: AbortSignal,
  ): Promise<GetHouseholdResponseDto> {
    return this.authenticated<GetHouseholdResponseDto>(
      'POST',
      '/api/v1/households/invitations/accept',
      accessToken,
      body,
      signal,
    );
  }

  async listInvitations(
    accessToken: string,
    householdId: string,
    signal?: AbortSignal,
  ): Promise<ListInvitationsResponseDto> {
    return this.authenticated<ListInvitationsResponseDto>(
      'GET',
      \`/api/v1/households/\${encodeURIComponent(householdId)}/invitations\`,
      accessToken,
      undefined,
      signal,
    );
  }

  async resendInvitation(
    accessToken: string,
    householdId: string,
    invitationId: string,
    signal?: AbortSignal,
  ): Promise<ResendInvitationResponseDto> {
    return this.authenticated<ResendInvitationResponseDto>(
      'POST',
      \`/api/v1/households/\${encodeURIComponent(householdId)}/invitations/\${encodeURIComponent(invitationId)}/resend\`,
      accessToken,
      undefined,
      signal,
    );
  }

  async revokeInvitation(
    accessToken: string,
    householdId: string,
    invitationId: string,
    signal?: AbortSignal,
  ): Promise<RevokeInvitationResponseDto> {
    return this.authenticated<RevokeInvitationResponseDto>(
      'POST',
      \`/api/v1/households/\${encodeURIComponent(householdId)}/invitations/\${encodeURIComponent(invitationId)}/revoke\`,
      accessToken,
      undefined,
      signal,
    );
  }

  async changeMemberRole(
    accessToken: string,
    householdId: string,
    membershipId: string,
    body: ChangeMemberRoleDto,
    signal?: AbortSignal,
  ): Promise<GetHouseholdResponseDto> {
    return this.authenticated<GetHouseholdResponseDto>(
      'PATCH',
      \`/api/v1/households/\${encodeURIComponent(householdId)}/members/\${encodeURIComponent(membershipId)}/role\`,
      accessToken,
      body,
      signal,
    );
  }

  async removeMember(
    accessToken: string,
    householdId: string,
    membershipId: string,
    signal?: AbortSignal,
  ): Promise<GetHouseholdResponseDto> {
    return this.authenticated<GetHouseholdResponseDto>(
      'DELETE',
      \`/api/v1/households/\${encodeURIComponent(householdId)}/members/\${encodeURIComponent(membershipId)}\`,
      accessToken,
      undefined,
      signal,
    );
  }

  private async post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(\`\${this.baseUrl}\${path}\`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      ...(signal === undefined ? {} : { signal }),
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      throw new ApiClientError(response.status, payload);
    }
    return payload as T;
  }

  private async authenticated<T>(
    method: 'GET' | 'PATCH' | 'POST' | 'DELETE',
    path: string,
    accessToken: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await fetch(\`\${this.baseUrl}\${path}\`, {
      method,
      credentials: 'include',
      headers: {
        authorization: \`Bearer \${accessToken}\`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal === undefined ? {} : { signal }),
    });
    const text = await response.text();
    const payload: unknown = text === '' ? undefined : JSON.parse(text);
    if (!response.ok) {
      throw new ApiClientError(response.status, payload);
    }
    return payload as T;
  }
}
`;

const indexSource = `// Generated from openapi.json. Do not edit.
export * from './client';
export * from './models';
`;

async function generate(): Promise<void> {
  process.env.DATABASE_URL ??= 'postgresql://openapi:openapi@127.0.0.1:1/openapi';
  process.env.NODE_ENV = 'test';
  const app = await createApplication({
    ...process.env,
  });
  try {
    const document = createOpenApiDocument(app);
    const registration = document.paths['/api/v1/auth/register']?.post;
    if (registration?.operationId !== 'register') {
      throw new Error('OpenAPI registration operation is missing or has an unstable operationId.');
    }
    if (document.components?.schemas?.RegisterDto === undefined
      || document.components.schemas.RegistrationAcceptedDto === undefined
      || document.components.schemas.CompleteEmailVerificationDto === undefined
      || document.components.schemas.CompleteEmailVerificationResponseDto === undefined
      || document.components.schemas.ResendEmailVerificationDto === undefined
      || document.components.schemas.ResendEmailVerificationResponseDto === undefined
      || document.components.schemas.RequestPasswordResetDto === undefined
      || document.components.schemas.PasswordResetRequestAcceptedDto === undefined
      || document.components.schemas.CompletePasswordResetDto === undefined) {
      throw new Error('OpenAPI authentication schemas are missing.');
    }
    if (document.components?.schemas?.LoginDto === undefined
      || document.components.schemas.LoginResponseDto === undefined
      || document.components.schemas.RefreshDto === undefined
      || document.components.schemas.RefreshResponseDto === undefined
      || document.paths['/api/v1/auth/login']?.post?.operationId !== 'login'
      || document.paths['/api/v1/auth/refresh']?.post?.operationId !== 'refresh'
      || document.paths['/api/v1/auth/logout']?.post?.operationId !== 'logout') {
      throw new Error('OpenAPI login, refresh, or logout operations are missing or unstable.');
    }
    if (document.paths['/api/v1/auth/email-verifications/complete']?.post?.operationId !== 'completeEmailVerification'
      || document.paths['/api/v1/auth/email-verifications/resend']?.post?.operationId !== 'resendEmailVerification') {
      throw new Error('OpenAPI email verification operations are missing or unstable.');
    }
    if (document.paths['/api/v1/auth/password-reset/request']?.post?.operationId !== 'requestPasswordReset'
      || document.paths['/api/v1/auth/password-reset/complete']?.post?.operationId !== 'completePasswordReset') {
      throw new Error('OpenAPI password reset operations are missing or unstable.');
    }
    if (document.paths['/api/v1/users/me']?.get?.operationId !== 'getMe'
      || document.paths['/api/v1/users/me']?.patch?.operationId !== 'updateMe'
      || document.components?.schemas?.UpdateMeDto === undefined
      || document.components.schemas.CurrentUserDto === undefined) {
      throw new Error('OpenAPI current-user operations or schemas are missing or unstable.');
    }
    if (document.paths['/api/v1/households']?.post?.operationId !== 'createHousehold'
      || document.components?.schemas?.CreateHouseholdDto === undefined
      || document.components.schemas.CreateHouseholdResponseDto === undefined
      || document.components.schemas.MembershipResponseDto === undefined) {
      throw new Error('OpenAPI household creation operation or schemas are missing or unstable.');
    }
    if (document.paths['/api/v1/households']?.get?.operationId !== 'listMyHouseholds'
      || document.components?.schemas?.ListMyHouseholdsItemDto === undefined) {
      throw new Error('OpenAPI household list operation or schemas are missing or unstable.');
    }
    const getHouseholdPath = document.paths['/api/v1/households/{id}']?.get;
    if (getHouseholdPath?.operationId !== 'getHousehold'
      || getHouseholdPath?.security === undefined
      || document.components?.schemas?.GetHouseholdResponseDto === undefined
      || document.components.schemas.GetHouseholdMemberDto === undefined) {
      throw new Error('OpenAPI household roster operation or schemas are missing or unstable.');
    }
    const updateHouseholdPath = document.paths['/api/v1/households/{id}']?.patch;
    if (updateHouseholdPath?.operationId !== 'updateHousehold'
      || updateHouseholdPath?.security === undefined
      || document.components?.schemas?.UpdateHouseholdDto === undefined
      || document.components.schemas.GetHouseholdResponseDto === undefined) {
      throw new Error('OpenAPI household rename operation or schemas are missing or unstable.');
    }
    const sendInvitationPath = document.paths['/api/v1/households/{id}/invitations']?.post;
    if (sendInvitationPath?.operationId !== 'sendHouseholdInvitation'
      || sendInvitationPath?.security === undefined
      || document.components?.schemas?.SendHouseholdInvitationDto === undefined
      || document.components.schemas.SendHouseholdInvitationResponseDto === undefined) {
      throw new Error('OpenAPI household invitation operation or schemas are missing or unstable.');
    }

    const previewInvitationPath = document.paths['/api/v1/households/invitations/preview']?.get;
    if (previewInvitationPath?.operationId !== 'previewInvitation'
      || document.components?.schemas?.InvitationPreviewResponseDto === undefined) {
      throw new Error('OpenAPI invitation preview operation or schemas are missing or unstable.');
    }

    const acceptInvitationPath = document.paths['/api/v1/households/invitations/accept']?.post;
    if (acceptInvitationPath?.operationId !== 'acceptInvitation'
      || acceptInvitationPath?.security === undefined
      || document.components?.schemas?.AcceptInvitationDto === undefined) {
      throw new Error('OpenAPI invitation accept operation or schemas are missing or unstable.');
    }

    const listInvitationsPath = document.paths['/api/v1/households/{id}/invitations']?.get;
    if (listInvitationsPath?.operationId !== 'listInvitations'
      || listInvitationsPath?.security === undefined
      || document.components?.schemas?.InvitationListItemDto === undefined
      || document.components.schemas.ListInvitationsResponseDto === undefined) {
      throw new Error('OpenAPI invitation list operation or schemas are missing or unstable.');
    }

    const resendInvitationPath = document.paths['/api/v1/households/{id}/invitations/{invitationId}/resend']?.post;
    if (resendInvitationPath?.operationId !== 'resendInvitation'
      || resendInvitationPath?.security === undefined
      || document.components?.schemas?.ResendInvitationResponseDto === undefined) {
      throw new Error('OpenAPI invitation resend operation or schemas are missing or unstable.');
    }

    const revokeInvitationPath = document.paths['/api/v1/households/{id}/invitations/{invitationId}/revoke']?.post;
    if (revokeInvitationPath?.operationId !== 'revokeInvitation'
      || revokeInvitationPath?.security === undefined
      || document.components?.schemas?.RevokeInvitationResponseDto === undefined) {
      throw new Error('OpenAPI invitation revoke operation or schemas are missing or unstable.');
    }

    const changeMemberRolePath = document.paths['/api/v1/households/{id}/members/{membershipId}/role']?.patch;
    if (changeMemberRolePath?.operationId !== 'changeMemberRole'
      || changeMemberRolePath?.security === undefined
      || document.components?.schemas?.ChangeMemberRoleDto === undefined) {
      throw new Error('OpenAPI changeMemberRole operation or schemas are missing or unstable.');
    }

    const removeMemberPath = document.paths['/api/v1/households/{id}/members/{membershipId}']?.delete;
    if (removeMemberPath?.operationId !== 'removeMember'
      || removeMemberPath?.security === undefined) {
      throw new Error('OpenAPI removeMember operation is missing or unstable.');
    }

    await mkdir(generatedRoot, { recursive: true });
    await Promise.all([
      writeFile(resolve(packageRoot, 'openapi.json'), `${JSON.stringify(document, null, 2)}\n`, 'utf8'),
      writeFile(resolve(generatedRoot, 'models.ts'), modelsSource, 'utf8'),
      writeFile(resolve(generatedRoot, 'client.ts'), clientSource, 'utf8'),
      writeFile(resolve(generatedRoot, 'index.ts'), indexSource, 'utf8'),
    ]);
  } finally {
    await app.close();
  }
}

await generate();
