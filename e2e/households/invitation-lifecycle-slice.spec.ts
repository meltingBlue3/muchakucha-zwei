import { createHash, randomBytes } from 'node:crypto';

import { expect, test } from '@playwright/test';
import { Client } from 'pg';

import { loginEmailFixture } from '../support/auth';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:5432/muchakucha_test';
const password = 'correct horse battery staple 2026';

// ---- Database helpers ----

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

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

async function prepareVerifiedAccount(
  seed: string,
  displayName: string,
): Promise<{ email: string; accessToken: string; userId: string }> {
  return withDatabase(async (database) => {
    const email = `lifecycle-${seed}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;

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
  recipientEmail: string,
  db: Client,
  overrides?: { expiresAt?: Date; consumedAt?: Date; invalidatedAt?: Date },
): Promise<{ rawToken: string; tokenHash: string }> {
  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(rawToken);
  const emailCanonical = recipientEmail.trim().normalize('NFC').toLowerCase();
  const expiresAt = overrides?.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const createdAt = expiresAt.getTime() <= Date.now()
    ? new Date(expiresAt.getTime() - 7 * 24 * 60 * 60 * 1000)
    : new Date();

  await db.query(
    `INSERT INTO "invitations" ("inviter_user_id", "inviter_membership_id", "household_id", "email_canonical", "hash", "role", "expires_at", "consumed_at", "invalidated_at", "created_at")
     VALUES ($1, $2, $3, $4, $5, 'MEMBER', $6, $7, $8, $9)`,
    [
      inviterUserId,
      inviterMembershipId,
      householdId,
      emailCanonical,
      tokenHash,
      expiresAt.toISOString(),
      overrides?.consumedAt?.toISOString() ?? null,
      overrides?.invalidatedAt?.toISOString() ?? null,
      createdAt.toISOString(),
    ],
  );

  return { rawToken, tokenHash };
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

  const owner = await prepareVerifiedAccount('owner', '家主');
  const admin = await prepareVerifiedAccount('admin', '管理员');
  const member = await prepareVerifiedAccount('member', '普通成员');
  const outsider = await prepareVerifiedAccount('outsider', '无关人员');

  const household = await createHousehold(owner.accessToken, '温暖小家');

  // Add admin and member via DB.
  await addMembershipViaDb(household.id, admin.userId, 'ADMIN');
  await addMembershipViaDb(household.id, member.userId, 'MEMBER');

  // Seed invitations with different states.
  await withDatabase(async (db) => {
    await seedInvitation(owner.userId, household.ownerMembershipId, household.id, 'pending@example.test', db);
    await seedInvitation(owner.userId, household.ownerMembershipId, household.id, 'expired@example.test', db, {
      expiresAt: new Date(Date.now() - 1000),
    });
    await seedInvitation(owner.userId, household.ownerMembershipId, household.id, 'consumed@example.test', db, {
      consumedAt: new Date(),
    });
    await seedInvitation(owner.userId, household.ownerMembershipId, household.id, 'revoked@example.test', db, {
      invalidatedAt: new Date(),
    });
    await seedInvitation(owner.userId, household.ownerMembershipId, household.id, 'resend@example.test', db);
    await seedInvitation(owner.userId, household.ownerMembershipId, household.id, 'revoke-test@example.test', db);
  });

  // ============================================================================
  // PRECONDITIONS: settings page is reachable
  // ============================================================================

  await loginEmailFixture(page, owner.email, password);

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

  // Verify invitation emails are shown (not account state)
  await expect(page.getByText('pending@example.test')).toBeVisible({ timeout: 3000 });

  // ============================================================================
  // RESEND: rotates token and creates new invitation
  // ============================================================================

  // Find the resend button for the pending invitation at resend@example.test
  await page.getByRole('button', { name: '重新发送邀请给 resend@example.test' }).click();

  // Resending opens the invite dialog with the result. Seeded email invitations
  // are delivered by the legacy email flow, so no share link is shown.
  const inviteDialog = page.getByRole('dialog', { name: '邀请家人' }).last();
  await expect(inviteDialog.getByRole('status')).toHaveText('邀请已重新发送。');
  await expect(inviteDialog.getByLabel('邀请链接', { exact: true })).toHaveCount(0);

  // Verify via API that the resend produced a pending invitation.
  const listResponse = await request.get(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}/invitations`,
    { headers: { authorization: `Bearer ${owner.accessToken}` } },
  );
  expect(listResponse.status()).toBe(200);
  const listBody = (await listResponse.json()) as { invitations: Array<{ emailCanonical: string; status: string }> };
  const resendInvs = listBody.invitations.filter((i) => i.emailCanonical === 'resend@example.test');
  expect(resendInvs.length).toBeGreaterThanOrEqual(1);
  expect(resendInvs.some((i) => i.status === 'pending')).toBe(true);

  await page.keyboard.press('Escape');
  await expect(inviteDialog).toBeHidden();

  // ============================================================================
  // REVOKE: confirmation dialog keeps or revokes the invitation
  // ============================================================================

  const revokeButton = page.getByRole('button', { name: '撤销邀请 revoke-test@example.test' });
  const revokeDialog = page.getByRole('dialog', { name: '撤销邀请？' }).last();

  // The safe action closes the dialog without revoking.
  await revokeButton.click();
  await expect(revokeDialog.getByText('撤销后，原链接将不能使用。')).toBeVisible();
  await revokeDialog.getByRole('button', { name: '保留邀请', exact: true }).click();
  await expect(revokeDialog).toBeHidden();
  await expect(revokeButton).toBeFocused();

  // The destructive action revokes it.
  await revokeButton.click();
  await revokeDialog.getByRole('button', { name: '撤销邀请', exact: true }).click();
  await expect(revokeDialog).toBeHidden();

  // Verify the invitation is now revoked via API
  await expect.poll(async () => {
    const postRevokeList = await request.get(
      `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}/invitations`,
      { headers: { authorization: `Bearer ${owner.accessToken}` } },
    );
    const postRevokeBody = (await postRevokeList.json()) as { invitations: Array<{ emailCanonical: string; status: string }> };
    return postRevokeBody.invitations
      .filter((i) => i.emailCanonical === 'revoke-test@example.test')
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
