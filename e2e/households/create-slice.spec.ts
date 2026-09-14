import { expect, test } from '@playwright/test';
import { Client } from 'pg';

import { loginEmailFixture } from '../support/auth';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:5432/muchakucha_test';
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

test('creates and displays the authoritative household', async ({ page, request }) => {
  test.setTimeout(60_000);

  const { email, accessToken } = await prepareVerifiedAccount();

  await loginEmailFixture(page, email, password);

  // Navigate to the no-household handoff and verify the heading is visible.
  await page.goto('/household-handoff');
  await expect(page.getByRole('heading', { name: '开始设置你的家庭' })).toBeVisible();

  // Click the create household button to navigate to /households/new.
  await page.getByRole('button', { name: '创建家庭' }).click();
  await expect(page).toHaveURL(/\/households\/new/);

  // Fill in the household name and submit.
  const nameField = page.getByLabel('家庭名称');
  await expect(nameField).toBeVisible();
  await nameField.fill('我的家');
  await page.getByRole('button', { name: '创建家庭' }).click();

  // Assert the authoritative result is displayed on the same route.
  await expect(page.getByRole('heading', { name: '家庭已创建' })).toBeVisible();
  await expect(page.getByText('家庭已创建。你现在是这个家庭的所有者。')).toBeVisible();

  // The app stays on /households/new — it does not navigate to an unowned route.
  await expect(page).toHaveURL(/\/households\/new/);

  const listed = await request.get(`${API_ORIGIN}/api/v1/households`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  expect(listed.status()).toBe(200);
  expect(await listed.json()).toEqual([
    expect.objectContaining({ name: '我的家', role: 'OWNER' }),
  ]);
  await page.getByRole('button', { name: '进入家庭' }).click();
  await expect(page.getByRole('button', { name: '当前家庭：我的家，切换家庭' })).toBeVisible();
});
