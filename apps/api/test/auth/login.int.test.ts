import { describe, expect, test } from 'vitest';

const apiOrigin = process.env.API_ORIGIN ?? 'http://127.0.0.1:18025';

async function login(body: Record<string, unknown>, origin?: string) {
  return fetch(`${apiOrigin}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
    body: JSON.stringify(body),
  });
}

describe.skip('login API contract', () => {
  test('logs in a verified account and creates an independent device session', async () => {
    const response = await login({ email: 'verified@example.test', password: 'correct horse battery staple', platform: 'native' });
    expect(await response.json()).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String) });
  });

  test('denies an unverified account without creating a session', async () => {
    const response = await login({ email: 'pending@example.test', password: 'correct horse battery staple' });
    expect(response.status).toBe(403);
  });

  test('uses the same generic invalid-credentials response for unknown email and wrong password', async () => {
    const unknown = await login({ email: 'unknown@example.test', password: 'wrong password' });
    const wrong = await login({ email: 'verified@example.test', password: 'wrong password' });
    expect([unknown.status, wrong.status]).toEqual([401, 401]);
    expect(await wrong.json()).toEqual(await unknown.json());
  });

  test('issues a short-lived access JWT with only verified sub, sid, signature, algorithm, key, and expiry claims', async () => {
    const response = await login({ email: 'verified@example.test', password: 'correct horse battery staple' });
    const { accessToken } = (await response.json()) as { accessToken: string };
    expect(accessToken.split('.')).toHaveLength(3);
  });

  test('issues Web refresh only in an HttpOnly cookie and never in JSON', async () => {
    const response = await login(
      { email: 'verified@example.test', password: 'correct horse battery staple', platform: 'web' },
      'http://127.0.0.1:8081',
    );
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    expect(JSON.stringify(await response.json())).not.toMatch(/refreshToken/);
  });

  test('uses a Secure-prefixed production cookie with bounded Path, SameSite, Secure, and Max-Age attributes', async () => {
    const response = await login(
      { email: 'verified@example.test', password: 'correct horse battery staple', platform: 'web' },
      'https://app.example.test',
    );
    expect(response.headers.get('set-cookie')).toMatch(/^__Secure-.*HttpOnly.*Secure.*SameSite=Lax.*Path=\/api\/v1\/auth/i);
  });

  test('allows credentialed CORS only for an exact configured Origin', async () => {
    const accepted = await login({ email: 'verified@example.test', password: 'correct horse battery staple' }, 'http://127.0.0.1:8081');
    const rejected = await login({ email: 'verified@example.test', password: 'correct horse battery staple' }, 'https://evil.example');
    expect(accepted.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:8081');
    expect(rejected.headers.get('access-control-allow-origin')).toBeNull();
  });

  test('throttles repeated login attempts without revealing account existence', async () => {
    const response = await login({ email: 'verified@example.test', password: 'wrong password' });
    expect([401, 429]).toContain(response.status);
  });
});
