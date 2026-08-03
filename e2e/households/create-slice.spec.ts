import { expect, test } from '@playwright/test';
import { Client } from 'pg';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:55432/muchakucha_test';
const password = 'correct horse battery staple 2026';

async function prepareVerifiedAccount(): Promise<{ email: string; accessToken: string }> {
  const database = new Client({ connectionString: DATABASE_URL });
  await database.connect();

  const email = `create-slice-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  try {
    const registerResponse = await fetch(`${API_ORIGIN}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({
        email,
        displayName: '新家主',
        password,
        platform: 'web',
      }),
    });
    expect(registerResponse.status).toBe(202);

    await database.query(
      `UPDATE "User" SET "email_verified_at" = now() WHERE "email_canonical" = lower($1)`,
      [email],
    );

    const loginResponse = await fetch(`${API_ORIGIN}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ email, password, platform: 'web' }),
    });
    expect(loginResponse.status).toBe(200);
    const loginBody: unknown = await loginResponse.json();
    const accessToken = (loginBody as { accessToken?: string }).accessToken;
    expect(accessToken).toBeDefined();

    return { email, accessToken };
  } finally {
    await database.end();
  }
}

test('creates and displays the authoritative household [RED:HOUSEHOLD_CREATE]', async ({ page, request }) => {
  test.setTimeout(60_000);

  const { accessToken } = await prepareVerifiedAccount();

  // Navigate to the Phase 1 no-household handoff
  await page.goto('/household-handoff');
  await expect(page.getByRole('heading')).toBeVisible();

  // Attempt to create a household through the not-yet-implemented API endpoint.
  // NestJS returns a 404 for the unknown route; the test expects the
  // dedicated marker that the Phase 2 implementation will remove.
  const createResponse = await request.post(`${API_ORIGIN}/api/v1/households`, {
    data: { name: '我的家' },
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const createBody: unknown = await createResponse.json();
  expect(createBody).toMatchObject({
    code: 'IMPLEMENTATION_MISSING_HOUSEHOLD_CREATE',
  });
});
