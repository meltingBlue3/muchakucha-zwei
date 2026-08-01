// Generated from openapi.json. Do not edit.
import type { RegisterDto, RegistrationAcceptedDto } from './models.js';

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
}
