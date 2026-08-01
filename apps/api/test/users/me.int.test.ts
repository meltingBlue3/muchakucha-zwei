import { describe, expect, test } from 'vitest';

const apiOrigin = process.env.API_ORIGIN ?? 'http://127.0.0.1:18025';

async function me(accessToken: string, method: 'GET' | 'PATCH' = 'GET', body?: Record<string, unknown>) {
  return fetch(`${apiOrigin}/api/v1/users/me`, {
    method,
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe.skip('current-user API contract', () => {
  test('registers UsersModule so GET /api/v1/users/me is reachable over booted HTTP', async () => {
    const response = await me('member-access-token');
    expect(response.status).toBe(200);
  });

  test('returns only the guard-derived subject public profile', async () => {
    const response = await me('member-access-token');
    expect(await response.json()).toEqual({
      id: expect.any(String),
      email: 'member@example.test',
      displayName: expect.any(String),
      emailVerified: true,
      hasHousehold: false,
    });
  });

  test('makes PATCH /api/v1/users/me reachable and updates only the guard-derived subject', async () => {
    const response = await me('member-access-token', 'PATCH', { displayName: 'Updated member' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ displayName: 'Updated member' });
  });

  test('allows two accounts to use the same display name', async () => {
    const responses = await Promise.all([
      me('member-a-access-token', 'PATCH', { displayName: 'Shared name' }),
      me('member-b-access-token', 'PATCH', { displayName: 'Shared name' }),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
  });

  test('rejects blank display names and unexpected mass-assignment fields', async () => {
    const response = await me('member-access-token', 'PATCH', { displayName: '', email: 'takeover@example.test', role: 'admin' });
    expect(response.status).toBe(400);
  });

  test('rejects cross-account targeting even when a foreign user id is supplied', async () => {
    const response = await me('member-access-token', 'PATCH', { displayName: 'Updated', userId: 'another-user' });
    expect(response.status).toBe(400);
  });

  test('does not expose auth internals or claim household and Today data in Phase 1', async () => {
    const response = await me('member-access-token');
    const body = JSON.stringify(await response.json());
    expect(body).not.toMatch(/password|refresh|session|token|households|today/i);
  });
});
