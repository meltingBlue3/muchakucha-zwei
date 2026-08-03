// Generated from openapi.json. Do not edit.
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
} from './models';

export class ApiClientError extends Error {
  constructor(readonly status: number, readonly body: unknown) {
    super(`API request failed with status ${status}.`);
    this.name = 'ApiClientError';
  }
}

export class ApiClient {
  constructor(private readonly baseUrl: string) {}

  async register(body: RegisterDto, signal?: AbortSignal): Promise<RegistrationAcceptedDto> {
    const response = await fetch(`${this.baseUrl}/api/v1/auth/register`, {
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
      `${this.baseUrl}/api/v1/auth/password-reset/complete`,
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
      `/api/v1/households/${encodeURIComponent(householdId)}`,
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
      `/api/v1/households/${encodeURIComponent(householdId)}`,
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
      `/api/v1/households/${encodeURIComponent(householdId)}/invitations`,
      accessToken,
      body,
      signal,
    );
  }

  async previewInvitation(token: string, signal?: AbortSignal): Promise<InvitationPreviewResponseDto> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/households/invitations/preview?token=${encodeURIComponent(token)}`,
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
      `/api/v1/households/${encodeURIComponent(householdId)}/invitations`,
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
      `/api/v1/households/${encodeURIComponent(householdId)}/invitations/${encodeURIComponent(invitationId)}/resend`,
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
      `/api/v1/households/${encodeURIComponent(householdId)}/invitations/${encodeURIComponent(invitationId)}/revoke`,
      accessToken,
      undefined,
      signal,
    );
  }

  private async post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
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
    method: 'GET' | 'PATCH' | 'POST',
    path: string,
    accessToken: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      credentials: 'include',
      headers: {
        authorization: `Bearer ${accessToken}`,
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
