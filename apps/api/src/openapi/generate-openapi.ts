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
`;

const clientSource = `// Generated from openapi.json. Do not edit.
import type {
  CompleteEmailVerificationDto,
  CompleteEmailVerificationResponseDto,
  RegisterDto,
  RegistrationAcceptedDto,
  ResendEmailVerificationDto,
  ResendEmailVerificationResponseDto,
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
      || document.components.schemas.ResendEmailVerificationResponseDto === undefined) {
      throw new Error('OpenAPI authentication schemas are missing.');
    }
    if (document.paths['/api/v1/auth/email-verifications/complete']?.post?.operationId !== 'completeEmailVerification'
      || document.paths['/api/v1/auth/email-verifications/resend']?.post?.operationId !== 'resendEmailVerification') {
      throw new Error('OpenAPI email verification operations are missing or unstable.');
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
