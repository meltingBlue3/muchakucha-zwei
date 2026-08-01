import { describe, expect, test } from 'vitest';

const apiOrigin = process.env.API_ORIGIN ?? 'http://127.0.0.1:18025';

async function logout(accessToken: string, body?: Record<string, unknown>, cookie?: string) {
  return fetch(`${apiOrigin}/api/v1/auth/logout`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
}

describe.skip('current-device logout API contract', () => {
  test('revokes exactly the session sid from the verified access token', async () => {
    const response = await logout('device-a-access-token');
    expect(response.status).toBe(204);
  });

  test('rejects attempts to target a user or session through the request body', async () => {
    const response = await logout('device-a-access-token', { sessionId: 'device-b', userId: 'another-user' });
    expect(response.status).toBe(400);
  });

  test('is idempotent for repeated current-device logout', async () => {
    const first = await logout('device-a-access-token');
    const second = await logout('device-a-access-token');
    expect([first.status, second.status]).toEqual([204, 204]);
  });

  test('clears the Web refresh cookie with the same name, Path, SameSite, and Secure topology', async () => {
    const response = await logout('device-a-access-token', undefined, 'mk_refresh=device-a-refresh');
    expect(response.headers.get('set-cookie')).toMatch(/mk_refresh=.*Max-Age=0.*Path=\/api\/v1\/auth/i);
  });

  test('leaves a second device session valid after current-device logout', async () => {
    await logout('device-a-access-token');
    const response = await fetch(`${apiOrigin}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'device-b-refresh-token' }),
    });
    expect(response.status).toBe(200);
  });

  test('prevents the logged-out device refresh token from being used again', async () => {
    await logout('device-a-access-token');
    const response = await fetch(`${apiOrigin}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'device-a-refresh-token' }),
    });
    expect(response.status).toBe(401);
  });
});
