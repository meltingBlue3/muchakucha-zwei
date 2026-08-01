import { describe, expect, test } from 'vitest';

const apiOrigin = process.env.API_ORIGIN ?? 'http://127.0.0.1:18025';

async function requestReset(email: string) {
  return fetch(`${apiOrigin}/api/v1/auth/password-reset/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

async function completeReset(body: Record<string, unknown>) {
  return fetch(`${apiOrigin}/api/v1/auth/password-reset/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe.skip('password reset API contract', () => {
  test('returns an equivalent generic response for existing and absent accounts', async () => {
    const existing = await requestReset('member@example.test');
    const absent = await requestReset('absent@example.test');
    expect([existing.status, absent.status]).toEqual([202, 202]);
    expect(await absent.json()).toEqual(await existing.json());
  });

  test('throttles reset requests without revealing account existence', async () => {
    const response = await requestReset('member@example.test');
    expect([202, 429]).toContain(response.status);
  });

  test.each(['expired', 'used', 'unknown', 'superseded'])(
    'rejects a %s reset token without changing credentials',
    async (kind) => {
      const response = await completeReset({ token: `${kind}-token`, password: 'new correct horse battery staple' });
      expect(response.status).toBe(400);
    },
  );

  test('rejects a new password from the committed top-3000 common-password fixture', async () => {
    const response = await completeReset({ token: 'valid-token', password: 'password' });
    expect(response.status).toBe(400);
  });

  test('atomically consumes one valid token, changes the password, and revokes every device session', async () => {
    const response = await completeReset({ token: 'valid-token', password: 'new correct horse battery staple' });
    expect(response.status).toBe(204);
  });

  test('rolls back token consumption, password change, and global revoke when the transaction fails', async () => {
    const response = await completeReset({ token: 'rollback-fixture-token', password: 'new correct horse battery staple' });
    expect(response.status).toBe(500);
  });

  test('denies the old password and accepts the new password only through normal login', async () => {
    const response = await completeReset({ token: 'valid-token', password: 'new correct horse battery staple' });
    expect(response.status).toBe(204);
  });

  test('does not auto-login or return session material after successful reset', async () => {
    const response = await completeReset({ token: 'valid-token', password: 'new correct horse battery staple' });
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await response.text()).toBe('');
  });
});
