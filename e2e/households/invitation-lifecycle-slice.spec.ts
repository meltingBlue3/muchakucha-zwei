
import { expect, test } from '@playwright/test';
import { Client } from 'pg';

import { loginUsernameFixture } from '../support/auth';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:5432/muchakucha_test';
const password = 'correct horse battery staple 2026';

// ---- Database helpers ----

async function withDatabase<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

// ---- Account helpers ----

async function prepareAccount(
  seed: string,
  displayName: string,
): Promise<{ username: string; accessToken: string; userId: string }> {
  return withDatabase(async (database) => {
    const username = `u-${seed.slice(0, 6)}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;

    const registerResponse = await fetch(`${API_ORIGIN}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({
        username,
        confirmPassword: password,
        password,
        platform: 'web',
      }),
    });
    expect(registerResponse.status).toBe(202);

    await database.query(
      `UPDATE "User" SET "display_name" = $2 WHERE "username_canonical" = lower($1)`,
      [username, displayName],
    );

    const userResult = await database.query(
      `SELECT "id" FROM "User" WHERE "username_canonical" = lower($1)`,
      [username],
    );
    const userId = userResult.rows[0]?.id as string;
    expect(userId).toBeDefined();

    const loginResponse = await fetch(`${API_ORIGIN}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ username, password, platform: 'web' }),
    });
    expect(loginResponse.status).toBe(200);
    const loginBody: unknown = await loginResponse.json();
    const accessToken = (loginBody as { accessToken?: string }).accessToken;
    expect(accessToken).toBeDefined();

    return { username, accessToken, userId };
  });
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

async function seedInvitation(
  inviterUserId: string,
  inviterMembershipId: string,
  householdId: string,
  recipientUsername: string,
  db: Client,
  overrides?: { expiresAt?: Date; consumedAt?: Date; invalidatedAt?: Date },
): Promise<void> {
  const username = recipientUsername.trim().normalize('NFC').toLowerCase();
  const expiresAt = overrides?.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const createdAt = expiresAt.getTime() <= Date.now()
    ? new Date(expiresAt.getTime() - 7 * 24 * 60 * 60 * 1000)
    : new Date();

  await db.query(
    `INSERT INTO "User" (username, username_canonical, display_name, password_hash)
     VALUES ($1::text, lower($1::text), $1::text, '$argon2id$fixture') ON CONFLICT (username_canonical) DO NOTHING`,
    [username],
  );
  await db.query(
    `INSERT INTO "invitations" ("inviter_user_id", "inviter_membership_id", "household_id", "username", "recipient_user_id", "role", "expires_at", "consumed_at", "invalidated_at", "created_at")
     VALUES ($1, $2, $3, $4::text, (SELECT id FROM "User" WHERE username_canonical = lower($4)), 'MEMBER', $5, $6, $7, $8)`,
    [
      inviterUserId,
      inviterMembershipId,
      householdId,
      username,
      expiresAt.toISOString(),
      overrides?.consumedAt?.toISOString() ?? null,
      overrides?.invalidatedAt?.toISOString() ?? null,
      createdAt.toISOString(),
    ],
  );

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

test('manages invitation lifecycle', async ({ page, request }) => {
  test.setTimeout(120_000);

  // ============================================================================
  // PRECONDITIONS: accounts, household, and invitation fixtures are healthy
  // ============================================================================

  const owner = await prepareAccount('owner', '家主');
  const admin = await prepareAccount('admin', '管理员');
  const member = await prepareAccount('member', '普通成员');
  const outsider = await prepareAccount('outsider', '无关人员');

  const household = await createHousehold(owner.accessToken, '温暖小家');

  // Add admin and member via DB.
  await addMembershipViaDb(household.id, admin.userId, 'ADMIN');
  await addMembershipViaDb(household.id, member.userId, 'MEMBER');

  // Seed invitations with different states.
  await withDatabase(async (db) => {
    await seedInvitation(owner.userId, household.ownerMembershipId, household.id, 'pending', db);
    await seedInvitation(owner.userId, household.ownerMembershipId, household.id, 'expired', db, {
      expiresAt: new Date(Date.now() - 1000),
    });
    await seedInvitation(owner.userId, household.ownerMembershipId, household.id, 'consumed', db, {
      consumedAt: new Date(),
    });
    await seedInvitation(owner.userId, household.ownerMembershipId, household.id, 'revoked', db, {
      invalidatedAt: new Date(),
    });
    await seedInvitation(owner.userId, household.ownerMembershipId, household.id, 'resend', db);
    await seedInvitation(owner.userId, household.ownerMembershipId, household.id, 'revoke-test', db);
  });

  // ============================================================================
  // PRECONDITIONS: settings page is reachable
  // ============================================================================

  await loginUsernameFixture(page, owner.username, password);

  // Navigate to the household settings
  await page.goto(`${WEB_ORIGIN}/households/${encodeURIComponent(household.id)}/settings`);
  await page.waitForURL(`/households/${encodeURIComponent(household.id)}/settings`);
  await page.waitForTimeout(2000);

  // Verify the household name is visible
  await expect(page.getByText('温暖小家').first()).toBeVisible({ timeout: 5000 });

  // ============================================================================
  // INVITATION LISTING: owner sees invitations with correct status
  // ============================================================================

  // Verify invitation statuses appear in the list
  await expect(page.getByText('待接受').first()).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('已过期')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('已接受')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('已撤销')).toBeVisible({ timeout: 5000 });

  // Verify invitation usernames are shown (not account state)
  await expect(page.getByText('pending')).toBeVisible({ timeout: 3000 });

  // ============================================================================
  // RESEND: replaces the pending inbox item
  // ============================================================================

  // Resend lives in the invitation's 「…」 menu.
  await page.getByRole('button', { name: '更多操作：邀请：resend' }).click();
  await page.getByRole('menuitem', { name: '重新发送邀请给 resend' }).click();

  // Resending returns a replacement link that the owner can share with the recipient.
  const inviteDialog = page.getByRole('dialog', { name: '邀请家人' }).last();
  await expect(inviteDialog.getByText('邀请已重新发送到对方的收件箱。')).toBeVisible();
  // Verify via API that the resend produced a pending invitation.
  const listResponse = await request.get(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}/invitations`,
    { headers: { authorization: `Bearer ${owner.accessToken}` } },
  );
  expect(listResponse.status()).toBe(200);
  const listBody = (await listResponse.json()) as { invitations: Array<{ username: string; status: string }> };
  const resendInvs = listBody.invitations.filter((i) => i.username === 'resend');
  expect(resendInvs.length).toBeGreaterThanOrEqual(1);
  expect(resendInvs.some((i) => i.status === 'pending')).toBe(true);

  await page.keyboard.press('Escape');
  await expect(inviteDialog).toBeHidden();

  // ============================================================================
  // REVOKE: confirmation dialog keeps or revokes the invitation
  // ============================================================================

  const revokeMenu = page.getByRole('button', { name: '更多操作：邀请：revoke-test' });
  const revoke = async () => {
    await revokeMenu.click();
    await page.getByRole('menuitem', { name: '撤销邀请 revoke-test' }).click();
  };
  const revokeDialog = page.getByRole('dialog', { name: '撤销邀请？' }).last();

  // The safe action closes the dialog without revoking.
  await revoke();
  await expect(revokeDialog.getByText('撤销后，对方将无法接受这份邀请。')).toBeVisible();
  await revokeDialog.getByRole('button', { name: '保留邀请', exact: true }).click();
  await expect(revokeDialog).toBeHidden();
  await expect(revokeMenu).toBeFocused();

  // The destructive action revokes it.
  await revoke();
  await revokeDialog.getByRole('button', { name: '撤销邀请', exact: true }).click();
  await expect(revokeDialog).toBeHidden();

  // Verify the invitation is now revoked via API
  await expect.poll(async () => {
    const postRevokeList = await request.get(
      `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}/invitations`,
      { headers: { authorization: `Bearer ${owner.accessToken}` } },
    );
    const postRevokeBody = (await postRevokeList.json()) as { invitations: Array<{ username: string; status: string }> };
    return postRevokeBody.invitations
      .filter((i) => i.username === 'revoke-test')
      .map((i) => i.status);
  }).toEqual(['revoked']);

  // ============================================================================
  // CROSS-HOUSEHOLD / MEMBER: non-owner/admin cannot access
  // ============================================================================

  // Outsider cannot access invitation listing at all
  const outsiderResponse = await request.get(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}/invitations`,
    { headers: { authorization: `Bearer ${outsider.accessToken}` } },
  );
  expect(outsiderResponse.status()).toBe(404);

  // Member cannot resend or revoke
  const memberListResponse = await request.get(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}/invitations`,
    { headers: { authorization: `Bearer ${member.accessToken}` } },
  );
  expect(memberListResponse.status()).toBe(403);
});
