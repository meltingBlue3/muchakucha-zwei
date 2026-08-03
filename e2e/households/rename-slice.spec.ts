import { expect, test } from '@playwright/test';
import { Client } from 'pg';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:55432/muchakucha_test';
const password = 'correct horse battery staple 2026';

async function prepareVerifiedAccount(
  seed: string,
  displayName: string,
): Promise<{ email: string; accessToken: string; userId: string }> {
  const database = new Client({ connectionString: DATABASE_URL });
  await database.connect();

  const email = `rename-slice-${seed}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  try {
    const registerResponse = await fetch(`${API_ORIGIN}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({
        email,
        displayName,
        password,
        platform: 'web',
      }),
    });
    expect(registerResponse.status).toBe(202);

    await database.query(
      `UPDATE "User" SET "email_verified_at" = now() WHERE "email_canonical" = lower($1)`,
      [email],
    );

    const userResult = await database.query(
      `SELECT "id" FROM "User" WHERE "email_canonical" = lower($1)`,
      [email],
    );
    const userId = userResult.rows[0]?.id as string;
    expect(userId).toBeDefined();

    const loginResponse = await fetch(`${API_ORIGIN}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ email, password, platform: 'web' }),
    });
    expect(loginResponse.status).toBe(200);
    const loginBody: unknown = await loginResponse.json();
    const accessToken = (loginBody as { accessToken?: string }).accessToken;
    expect(accessToken).toBeDefined();

    return { email, accessToken, userId };
  } finally {
    await database.end();
  }
}

async function createHousehold(
  accessToken: string,
  name: string,
): Promise<{ id: string; name: string; ownerMembershipId: string }> {
  const response = await fetch(`${API_ORIGIN}/api/v1/households`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });
  const body: unknown = await response.json();
  const household = body as { id: string; name: string; ownerMembershipId: string };
  expect(response.status).toBe(201);
  return { id: household.id, name: household.name, ownerMembershipId: household.ownerMembershipId };
}

async function addMembershipViaDb(
  householdId: string,
  userId: string,
  role: string,
): Promise<void> {
  const database = new Client({ connectionString: DATABASE_URL });
  await database.connect();
  try {
    await database.query(
      `INSERT INTO "memberships" ("user_id", "household_id", "role")
       VALUES ($1, $2, $3)`,
      [userId, householdId, role],
    );
  } finally {
    await database.end();
  }
}

// --- Static guard: this file must contain exactly one test() call. ---
// The verify automation counts test( occurrences; adding a second test() would
// break the gate. Keep integration and tie-case variants outside this dedicated file.

test('renames the explicit current household [RED:HOUSEHOLD_RENAME]', async ({ page, request }) => {
  test.setTimeout(120_000);

  // --- Precondition: auth is healthy ---
  const owner = await prepareVerifiedAccount('owner', '家主');
  const member = await prepareVerifiedAccount('member', '普通成员');
  const outsider = await prepareVerifiedAccount('outsider', '无关人员');

  // --- Precondition: household creation works ---
  const household = await createHousehold(owner.accessToken, '温暖小家');

  // Add a member to the household (direct DB insert since invites are not in this plan).
  await addMembershipViaDb(household.id, member.userId, 'MEMBER');

  // --- Precondition: roster endpoint is healthy ---
  const rosterResponse = await request.get(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}`,
    { headers: { authorization: `Bearer ${owner.accessToken}` } },
  );
  expect(rosterResponse.status()).toBe(200);
  const rosterBody = await rosterResponse.json();
  const roster = rosterBody as {
    id: string;
    name: string;
    members: Array<{ role: string; isCurrentUser: boolean }>;
  };
  expect(roster.id).toBe(household.id);
  expect(roster.name).toBe('温暖小家');
  expect(roster.members[0].role).toBe('OWNER');
  expect(roster.members[0].isCurrentUser).toBe(true);

  // --- Precondition: /households selector is healthy ---
  await page.goto('/households');
  await expect(page).toHaveURL(/\/households/);

  // --- Precondition: roster navigation works ---
  await page.getByRole('button', { name: '查看成员' }).first().click();
  await expect(page).toHaveURL(/\/households\//);
  await expect(page.getByText('温暖小家').first()).toBeVisible();

  // --- Navigate to the settings route ---
  await page.goto(`/households/${encodeURIComponent(household.id)}/settings`);
  await page.waitForURL(`/households/${encodeURIComponent(household.id)}/settings`);
  await page.waitForTimeout(1500);

  // --- Observe the destination note ---
  // The settings form must repeat "保存到：{家庭名称}" as the explicit destination note.
  await expect(page.getByText('保存到：温暖小家')).toBeVisible({ timeout: 5000 });

  // --- Rename the household ---
  const nameField = page.getByLabel('家庭名称');
  await expect(nameField).toBeVisible();
  await nameField.fill('');
  await nameField.fill('崭新的家');

  // No extra confirmation — click save directly.
  await page.getByRole('button', { name: '保存' }).click();

  // --- Verify the header updates to the new authoritative name ---
  await expect(page.getByText('崭新的家').first()).toBeVisible({ timeout: 5000 });

  // --- Verify the destination note updates too ---
  await expect(page.getByText('保存到：崭新的家')).toBeVisible({ timeout: 5000 });

  // --- Verify the save success feedback ---
  await expect(page.getByText('家庭名称已更新。')).toBeVisible({ timeout: 5000 });

  // --- Verify the roster API reflects the rename ---
  const verifyResponse = await request.get(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}`,
    { headers: { authorization: `Bearer ${owner.accessToken}` } },
  );
  expect(verifyResponse.status()).toBe(200);
  const verifyBody = await verifyResponse.json();
  expect(verifyBody.name).toBe('崭新的家');

  // --- Verify a non-owner member cannot rename ---
  const memberRenameResponse = await request.fetch(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}`,
    {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${member.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: '成员试图改名' }),
    },
  );
  expect(memberRenameResponse.status()).toBe(403);

  // --- Verify an outsider cannot rename ---
  const outsiderRenameResponse = await request.fetch(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}`,
    {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${outsider.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: '外人试图改名' }),
    },
  );
  expect(outsiderRenameResponse.status()).toBe(404);
});
