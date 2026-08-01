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
`;

const clientSource = `// Generated from openapi.json. Do not edit.
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
  RequestPasswordResetDto,
  PasswordResetRequestAcceptedDto,
  CompletePasswordResetDto,
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
    method: 'GET' | 'PATCH' | 'POST',
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
