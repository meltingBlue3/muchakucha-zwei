// Generated from openapi.json. Do not edit.
import type {
  CompleteEmailVerificationDto,
  CompleteEmailVerificationResponseDto,
  RegisterDto,
  RegistrationAcceptedDto,
  LoginDto,
  LoginResponseDto,
  RefreshDto,
  RefreshResponseDto,
  UpdateMeDto,
  CurrentUserDto,
  ResendEmailVerificationDto,
  ResendEmailVerificationResponseDto,
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
    method: 'GET' | 'PATCH',
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
    const payload: unknown = await response.json();
    if (!response.ok) {
      throw new ApiClientError(response.status, payload);
    }
    return payload as T;
  }
}
