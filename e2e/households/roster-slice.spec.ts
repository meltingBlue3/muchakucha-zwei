import { expect, test } from '@playwright/test';
import { Client } from 'pg';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:5432/muchakucha_test';
const password = 'correct horse battery staple 2026';

async function prepareVerifiedAccount(
  seed: string,
  displayName: string,
): Promise<{ email: string; accessToken: string; userId: string }> {
  const database = new Client({ connectionString: DATABASE_URL });
  await database.connect();

  const email = `roster-slice-${seed}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
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

    // Fetch the user ID.
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

test('shows the isolated totally ordered roster', async ({ page, request }) => {
  test.setTimeout(120_000);

  // --- Precondition: auth is healthy ---
  const owner = await prepareVerifiedAccount('owner', '家主');
  const adminActor = await prepareVerifiedAccount('admin', '管理员');
  const memberActor = await prepareVerifiedAccount('member', '普通成员');
  const outsider = await prepareVerifiedAccount('outsider', '无关人员');

  // --- Precondition: database and household creation work ---
  const household = await createHousehold(owner.accessToken, '温暖小家');

  // Add admin and member to the household (direct DB insert since invites are
  // not implemented in this plan).
  await addMembershipViaDb(household.id, adminActor.userId, 'ADMIN');
  await addMembershipViaDb(household.id, memberActor.userId, 'MEMBER');

  // --- Verify: getHousehold API returns the totally ordered roster ---
  const rosterResponse = await request.get(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}`,
    { headers: { authorization: `Bearer ${owner.accessToken}` } },
  );
  expect(rosterResponse.status()).toBe(200);
  const rosterBody = await rosterResponse.json();
  const roster = rosterBody as {
    id: string;
    name: string;
    ownerMembershipId: string;
    members: Array<{
      membershipId: string;
      userId: string;
      displayName: string;
      email: string;
      role: 'OWNER' | 'ADMIN' | 'MEMBER';
      isCurrentUser: boolean;
    }>;
  };
  expect(roster.id).toBe(household.id);
  expect(roster.name).toBe('温暖小家');
  expect(roster.members).toHaveLength(3);

  // Total order: OWNER -> ADMIN -> MEMBER; current user first within role.
  expect(roster.members[0].role).toBe('OWNER');
  expect(roster.members[0].isCurrentUser).toBe(true);
  expect(roster.members[0].displayName).toBe('家主');

  expect(roster.members[1].role).toBe('ADMIN');
  expect(roster.members[1].displayName).toBe('管理员');

  expect(roster.members[2].role).toBe('MEMBER');
  expect(roster.members[2].displayName).toBe('普通成员');

  // --- Verify: cross-household isolation ---
  // An outsider cannot access the household roster.
  const outsiderResponse = await request.get(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}`,
    { headers: { authorization: `Bearer ${outsider.accessToken}` } },
  );
  expect(outsiderResponse.status()).toBe(404);

  // --- Verify: admin sees themselves first within the ADMIN role ---
  const adminView = await request.get(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}`,
    { headers: { authorization: `Bearer ${adminActor.accessToken}` } },
  );
  expect(adminView.status()).toBe(200);
  const adminRoster = await adminView.json();
  expect(adminRoster.members[0].role).toBe('OWNER');
  expect(adminRoster.members[0].isCurrentUser).toBe(false);

  // The admin is current actor - should appear first within ADMIN role.
  expect(adminRoster.members[1].role).toBe('ADMIN');
  expect(adminRoster.members[1].isCurrentUser).toBe(true);
  expect(adminRoster.members[1].displayName).toBe('管理员');

  expect(adminRoster.members[2].role).toBe('MEMBER');

  await page.goto('/login');
  await page.getByLabel('邮箱').fill(owner.email);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).not.toHaveURL(/\/login$/);

  // --- Verify: the /households selector route renders ---
  await page.goto('/households');
  await expect(page).toHaveURL(/\/households/);

  // --- Verify: navigation to the owned household destination works ---
  // Click "查看成员" on the HouseholdCard to navigate.
  await page.getByRole('button', { name: '查看成员' }).first().click();
  await expect(page).toHaveURL(/\/households\//);

  const rosterMain = page.getByRole('main');

  // The roster page should show the household name in the header.
  await expect(rosterMain.getByText('温暖小家').first()).toBeVisible();

  // The member overview should list all members.
  await expect(rosterMain.getByText('家主').first()).toBeVisible();
  await expect(rosterMain.getByText('管理员').first()).toBeVisible();
  await expect(rosterMain.getByText('普通成员').first()).toBeVisible();

  // Role badges should be visible.
  await expect(rosterMain.getByText('所有者').first()).toBeVisible();
  await expect(rosterMain.getByText('成员').first()).toBeVisible();

  // The "我" tag should appear for the current user.
  // Since the owner is navigating, the page should show "我" for the owner.
  await expect(rosterMain.getByText('我').first()).toBeVisible();
});
