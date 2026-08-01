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
`;

const clientSource = `// Generated from openapi.json. Do not edit.
import type { RegisterDto, RegistrationAcceptedDto } from './models';

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
      || document.components.schemas.RegistrationAcceptedDto === undefined) {
      throw new Error('OpenAPI registration schemas are missing.');
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
