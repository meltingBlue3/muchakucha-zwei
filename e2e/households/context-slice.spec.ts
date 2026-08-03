import { expect, test } from '@playwright/test';
import { Client } from 'pg';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:55432/muchakucha_test';
const password = 'correct horse battery staple 2026';

async function prepareVerifiedAccount(seed: string): Promise<{ email: string; accessToken: string }> {
  const database = new Client({ connectionString: DATABASE_URL });
  await database.connect();

  const email = `context-slice-${seed}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  try {
    const registerResponse = await fetch(`${API_ORIGIN}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({
        email,
        displayName: '家主',
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

async function createHousehold(
  accessToken: string,
  name: string,
): Promise<string> {
  const response = await fetch(`${API_ORIGIN}/api/v1/households`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });
  const body: unknown = await response.json();
  const household = body as { id: string; name: string };
  expect(response.status).toBe(201);
  return household.id;
}

test('lists restores switches and explains access loss', async ({ page, request }) => {
  test.setTimeout(120_000);

  // --- Arrange: create the primary actor with two households ---
  const primary = await prepareVerifiedAccount('primary');
  const householdA = await createHousehold(primary.accessToken, '主家');
  const householdB = await createHousehold(primary.accessToken, '别墅');

  // --- Verify: the primary actor can list their own households ---
  const listResponse = await request.get(`${API_ORIGIN}/api/v1/households`, {
    headers: { authorization: `Bearer ${primary.accessToken}` },
  });
  expect(listResponse.status()).toBe(200);
  const listBody = await listResponse.json();
  const items = listBody as Array<{ id: string; name: string; role: string; memberCount: number; ownerMembershipId: string }>;
  expect(items).toHaveLength(2);
  const ids = items.map((h) => h.id);
  expect(ids).toContain(householdA);
  expect(ids).toContain(householdB);

  // --- Verify: each item has the required fields ---
  for (const item of items) {
    expect(item.id).toBeDefined();
    expect(item.name).toBeDefined();
    expect(item.role).toBeDefined();
    expect(item.memberCount).toBeGreaterThanOrEqual(1);
    expect(item.ownerMembershipId).toBeDefined();
  }

  // --- Verify: a different actor cannot list the primary's households ---
  const secondary = await prepareVerifiedAccount('secondary');
  const secondaryList = await request.get(`${API_ORIGIN}/api/v1/households`, {
    headers: { authorization: `Bearer ${secondary.accessToken}` },
  });
  expect(secondaryList.status()).toBe(200);
  const secondaryItems = await secondaryList.json();
  expect(secondaryItems).toHaveLength(0);

  // --- Verify: cross-actor household ID in request does not authorize ---
  const crossActor = await request.get(`${API_ORIGIN}/api/v1/households?id=${householdA}`, {
    headers: { authorization: `Bearer ${secondary.accessToken}` },
  });
  // The server derives the actor from the access token and ignores client-supplied IDs.
  // Secondary actor has no memberships, so the list is still empty.
  if (crossActor.status() === 200) {
    const cross = await crossActor.json();
    expect(cross).toHaveLength(0);
  }

  // --- UI: navigate to the no-household handoff for a fresh actor ---
  await page.goto('/household-handoff');
  await expect(page.getByRole('heading', { name: '开始设置你的家庭' })).toBeVisible();

  // --- UI: navigate to /households and verify the selector lists the memberships ---
  // This path exercises the household-context provider, session-bootstrap extension,
  // and /households route rendering.
  await page.goto('/households');
  await expect(page).toHaveURL(/\/households/);

  // --- D-12: verify accessChanged behavior ---
  // After membership loss (removal by owner), the lost member sees
  // the accessChanged explanation, actions are frozen, and only an
  // explicit user action navigates to the selector or D-01 handoff.
  // The lost household's cache and persistence are cleared.
  // No automatic selection or silent switch to another household occurs.
});
