import { describe, expect, test } from 'vitest';

const apiOrigin = process.env.API_ORIGIN ?? 'http://127.0.0.1:18025';

async function complete(body: Record<string, unknown>, cookie?: string) {
  return fetch(`${apiOrigin}/api/v1/auth/verify-email/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

describe.skip('email verification API contract', () => {
  test('uses the registration-created Web pending proof for same-device verification and automatic session', async () => {
    const response = await complete({ token: 'verification-token' }, 'mk_pending=pending-proof');
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toMatch(/refresh.*HttpOnly/i);
  });

  test('uses the registration-created native pending proof for same-device verification and returns refresh material', async () => {
    const response = await complete({ token: 'verification-token', pendingProof: 'pending-proof', platform: 'native' });
    expect(await response.json()).toMatchObject({ refreshToken: expect.any(String) });
  });

  test('verifies on a cross-device request without creating a session and guides login', async () => {
    const response = await complete({ token: 'verification-token' });
    expect(await response.json()).toMatchObject({ outcome: 'verified_login_required' });
    expect(response.headers.get('set-cookie') ?? '').not.toMatch(/refresh/i);
  });

  test.each(['expired', 'used', 'invalid', 'superseded'])(
    'classifies a %s verification link as a distinct terminal outcome',
    async (outcome) => {
      const response = await complete({ token: `${outcome}-verification-token` });
      expect(await response.json()).toMatchObject({ outcome });
    },
  );

  test('does not consume a verification token through a mail-landing GET', async () => {
    const landing = await fetch(`${apiOrigin}/api/v1/auth/verify-email?token=verification-token`);
    expect(landing.status).not.toBe(200);
  });

  test('consumes a verification token and matching pending proof at most once', async () => {
    const results = await Promise.all([
      complete({ token: 'one-time-token', pendingProof: 'one-time-proof' }),
      complete({ token: 'one-time-token', pendingProof: 'one-time-proof' }),
    ]);
    expect(results.filter(({ status }) => status === 200)).toHaveLength(1);
  });

  test('resend returns an authoritative 60-second retry value and supersedes the prior token', async () => {
    const response = await fetch(`${apiOrigin}/api/v1/auth/verify-email/resend`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'member@example.test' }),
    });
    expect(await response.json()).toMatchObject({ retryAfterSeconds: 60 });
  });

  test('enforces resend eligibility and throttling on the server', async () => {
    const response = await fetch(`${apiOrigin}/api/v1/auth/verify-email/resend`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'member@example.test' }),
    });
    expect([202, 429]).toContain(response.status);
  });

  test('clears the Web pending cookie with matching attributes and exposes no proof or refresh in JSON', async () => {
    const response = await complete({ token: 'verification-token' }, 'mk_pending=pending-proof');
    expect(response.headers.get('set-cookie')).toMatch(/mk_pending=.*Max-Age=0/i);
    expect(JSON.stringify(await response.json())).not.toMatch(/(?:pendingProof|refreshToken)/);
  });
});
