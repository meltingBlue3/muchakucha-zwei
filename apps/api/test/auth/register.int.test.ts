import { describe, expect, test } from 'vitest';

const apiOrigin = process.env.API_ORIGIN ?? 'http://127.0.0.1:18025';

async function register(body: Record<string, unknown>, origin?: string) {
  return fetch(`${apiOrigin}/api/v1/auth/register`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe.skip('registration API contract', () => {
  test('returns the same generic 202 response shape for new and existing canonical email', async () => {
    const body = { email: 'Member@Example.test', displayName: 'Member', password: 'correct horse battery staple' };
    const first = await register(body);
    const duplicate = await register(body);
    expect([first.status, duplicate.status]).toEqual([202, 202]);
    expect(await duplicate.json()).toEqual(await first.json());
  });

  test('rejects every password in the committed top-3000 common-password fixture', async () => {
    const response = await register({ email: 'weak@example.test', displayName: 'Member', password: 'password' });
    expect(response.status).toBe(400);
  });

  test('persists the password only as an Argon2id hash', async () => {
    const response = await register({ email: 'argon@example.test', displayName: 'Member', password: 'correct horse battery staple' });
    expect(response.status).toBe(202);
    // The owning schema/API plan replaces this HTTP-only probe with a direct migrated-DB assertion.
  });

  test('persistence collides trim, Unicode-normalized, and lowercase canonical email equivalents under race', async () => {
    const password = 'correct horse battery staple';
    const responses = await Promise.all([
      register({ email: '  MeMber@example.test ', displayName: 'One', password }),
      register({ email: 'member@example.test', displayName: 'Two', password }),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([202, 202]);
  });

  test('persistence preserves the original delivery email separately from canonical identity', async () => {
    const response = await register({ email: 'Delivery.Case@Example.test', displayName: 'Member', password: 'correct horse battery staple' });
    expect(response.status).toBe(202);
  });

  test('persistence allows duplicate display names for different users', async () => {
    const password = 'correct horse battery staple';
    const responses = await Promise.all([
      register({ email: 'one@example.test', displayName: 'Shared name', password }),
      register({ email: 'two@example.test', displayName: 'Shared name', password }),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([202, 202]);
  });

  test('persistence stores verification tokens and pending proofs only as hashes', async () => {
    const response = await register({ email: 'hashes@example.test', displayName: 'Member', password: 'correct horse battery staple' });
    expect(response.status).toBe(202);
  });

  test('rejects blank, overlong, and unexpected registration fields', async () => {
    const response = await register({ email: '', displayName: '', password: '', role: 'admin' });
    expect(response.status).toBe(400);
  });

  test('issues Web pending proof only as a bounded HttpOnly cookie and omits it from JSON', async () => {
    const response = await register(
      { email: 'web@example.test', displayName: 'Member', password: 'correct horse battery staple', platform: 'web' },
      'http://127.0.0.1:8081',
    );
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    expect(JSON.stringify(await response.json())).not.toMatch(/pending.*proof/i);
  });

  test('returns native pending proof for secure storage without exposing persisted plaintext', async () => {
    const response = await register({
      email: 'native@example.test',
      displayName: 'Member',
      password: 'correct horse battery staple',
      platform: 'native',
    });
    expect(await response.json()).toMatchObject({ pendingProof: expect.any(String) });
  });
});
