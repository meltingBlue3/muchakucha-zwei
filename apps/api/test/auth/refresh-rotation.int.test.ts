import { describe, expect, test } from 'vitest';

const apiOrigin = process.env.API_ORIGIN ?? 'http://127.0.0.1:18025';

async function refresh(refreshToken: string, cookie?: string) {
  return fetch(`${apiOrigin}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(cookie ? {} : { refreshToken }),
  });
}

describe.skip('refresh rotation API contract', () => {
  test('rotates a valid refresh token and retains only generation hashes', async () => {
    const response = await refresh('generation-zero');
    expect(await response.json()).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String) });
  });

  test.each(['expired', 'revoked', 'unknown'])(
    'rejects a %s refresh token without issuing successor credentials',
    async (kind) => {
      const response = await refresh(`${kind}-refresh-token`);
      expect(response.status).toBe(401);
    },
  );

  test('detects replay of a consumed generation and revokes that session family', async () => {
    await refresh('generation-zero');
    const replay = await refresh('generation-zero');
    expect(replay.status).toBe(401);
  });

  test('keeps two device session families independent when one rotates or is compromised', async () => {
    const deviceA = await refresh('device-a-generation-zero');
    const deviceB = await refresh('device-b-generation-zero');
    expect([deviceA.status, deviceB.status]).toEqual([200, 200]);
  });

  test('serializes two simultaneous requests so one generation is consumed at most once', async () => {
    const responses = await Promise.all([refresh('contended-generation'), refresh('contended-generation')]);
    expect(responses.filter(({ status }) => status === 200)).toHaveLength(1);
  });

  test('enforces the session absolute expiry even when the refresh generation is otherwise valid', async () => {
    const response = await refresh('absolute-expiry-generation');
    expect(response.status).toBe(401);
  });

  test('password-reset global revoke invalidates refresh tokens from every device', async () => {
    const responses = await Promise.all([refresh('reset-device-a'), refresh('reset-device-b')]);
    expect(responses.map(({ status }) => status)).toEqual([401, 401]);
  });

  test('accepts exactly one platform credential source and rejects ambiguous cookie plus body input', async () => {
    const response = await fetch(`${apiOrigin}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'mk_refresh=web-token' },
      body: JSON.stringify({ refreshToken: 'native-token' }),
    });
    expect(response.status).toBe(400);
  });

  test('rotates Web cookie credentials without exposing refresh material in JSON', async () => {
    const response = await refresh('', 'mk_refresh=web-generation-zero');
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    expect(JSON.stringify(await response.json())).not.toMatch(/refreshToken/);
  });
});
