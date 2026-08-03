import { expect, test } from '@playwright/test';
import { Client } from 'pg';
import { createHash, randomBytes } from 'node:crypto';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const EMAIL_LINK_ORIGIN = process.env.EMAIL_LINK_ORIGIN ?? 'http://127.0.0.1:8081';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:55432/muchakucha_test';
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
    const email = `invite-accept-${seed}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;

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

async function seedPendingInvitation(
  inviterUserId: string,
  inviterMembershipId: string,
  householdId: string,
  recipientEmail: string,
  db: Client,
): Promise<string> {
  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(rawToken);
  const emailCanonical = recipientEmail.trim().normalize('NFC').toLowerCase();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.query(
    `INSERT INTO "invitations" ("inviter_user_id", "inviter_membership_id", "household_id", "email_canonical", "hash", "role", "expires_at")
     VALUES ($1, $2, $3, $4, $5, 'MEMBER', $6)`,
    [inviterUserId, inviterMembershipId, householdId, emailCanonical, tokenHash, expiresAt.toISOString()],
  );

  return rawToken;
}

// --- Static guard: this file must contain exactly one test() call. ---
// The verify automation counts test( occurrences; adding a second test() would
// break the gate. Keep integration and tie-case variants outside this dedicated file.

test('accepts an invitation explicitly [RED:INVITATION_ACCEPT]', async ({ page, request }) => {
  test.setTimeout(120_000);

  // ============================================================================
  // PRECONDITIONS: token sanitation, auth return, and invitation fixtures
  // ============================================================================

  // --- Precondition: account creation and authentication are healthy ---
  const owner = await prepareVerifiedAccount('owner', '家主');
  const invitee = await prepareVerifiedAccount('invitee', '被邀请人');
  const stranger = await prepareVerifiedAccount('stranger', '陌生人');

  // --- Precondition: household creation works ---
  const household = await createHousehold(owner.accessToken, '温暖小家');

  // --- Precondition: invitation fixtures and DB state are healthy ---
  const rawToken = await withDatabase(async (db) =>
    seedPendingInvitation(
      owner.userId,
      household.ownerMembershipId,
      household.id,
      invitee.email,
      db,
    ),
  );

  const inviteUrl = `${EMAIL_LINK_ORIGIN}/invite?token=${encodeURIComponent(rawToken)}`;

  // --- Precondition: the invitation exists in DB with valid state ---
  await withDatabase(async (db) => {
    const result = await db.query(
      `SELECT "hash", "email_canonical", "role", "expires_at", "invalidated_at", "consumed_at"
       FROM "invitations"
       WHERE "household_id" = $1 AND "email_canonical" = lower($2)
       ORDER BY "created_at" DESC LIMIT 1`,
      [household.id, invitee.email],
    );
    expect(result.rows.length).toBe(1);
    const inv = result.rows[0] as Record<string, unknown>;
    expect(inv.role).toBe('MEMBER');
    expect(inv.consumed_at).toBeNull();
    expect(inv.invalidated_at).toBeNull();
    const expiry = new Date(inv.expires_at as string);
    expect(expiry.getTime()).toBeGreaterThan(Date.now());

    // Hash is lowercase SHA-256 hex
    const hashStr = String(inv.hash);
    expect(hashStr).toMatch(/^[0-9a-f]{64}$/);
    expect(hashStr).toBe(hashStr.toLowerCase());

    // Raw token is NOT stored in the database
    const dbDump = JSON.stringify(result.rows);
    expect(dbDump).not.toContain(rawToken);

    // Token hash matches
    expect(hashStr).toBe(hashToken(rawToken));
  });

  // ============================================================================
  // D-07: PUBLIC PREVIEW — unauthenticated visit shows household name + inviter
  // ============================================================================

  // Navigate to invitation URL as an unauthenticated user
  await page.goto(inviteUrl);
  await page.waitForTimeout(1500);

  // --- Token sanitation check: the URL should no longer contain the raw token ---
  // D-07 requires immediate sanitization of Web history/native params.
  const currentUrl = page.url();
  expect(currentUrl).not.toContain(rawToken);
  expect(currentUrl).not.toMatch(/token=/);

  // --- Preview: household name and inviter display name are shown ---
  await expect(page.getByText('温暖小家')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('家主')).toBeVisible({ timeout: 5000 });

  // --- Preview: login and create-account entry points are present ---
  await expect(page.getByRole('button', { name: '登录并继续' })).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole('button', { name: '创建账户并继续' })).toBeVisible({ timeout: 5000 });

  // ============================================================================
  // D-07: AUTH RETURN — after login, user returns to invitation page; auto-accept
  //        call count stays zero until explicit press.
  // ============================================================================

  // Click "登录并继续" and complete login
  await page.getByRole('button', { name: '登录并继续' }).click();

  // Should be on the login page
  await expect(page).toHaveURL(/\/login/);

  // Complete login with the invited email
  await page.getByLabel('邮箱地址').fill(invitee.email);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录' }).click();

  // After login, the user should be returned to the invitation page (not auto-accepted)
  await page.waitForTimeout(2000);
  await expect(page.getByText('温暖小家')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('家主')).toBeVisible({ timeout: 5000 });

  // --- D-07: No auto-accept — the invitation must still be pending in DB ---
  await withDatabase(async (db) => {
    const result = await db.query(
      `SELECT "consumed_at" FROM "invitations"
       WHERE "household_id" = $1 AND "email_canonical" = lower($2)
       ORDER BY "created_at" DESC LIMIT 1`,
      [household.id, invitee.email],
    );
    expect(result.rows.length).toBe(1);
    // Invitation must NOT be consumed (auto-accept would consume it)
    expect(result.rows[0].consumed_at).toBeNull();
  });

  // --- The invitation is NOT yet in the user's household list ---
  const preAcceptList = await request.get(`${API_ORIGIN}/api/v1/households`, {
    headers: { authorization: `Bearer ${invitee.accessToken}` },
  });
  expect(preAcceptList.status()).toBe(200);
  const preAcceptBody = (await preAcceptList.json()) as Array<{ id: string }>;
  const inListBefore = preAcceptBody.some((h) => h.id === household.id);
  expect(inListBefore).toBe(false);

  // --- D-07: Explicit accept button is present ---
  // User must explicitly click "接受邀请" — not auto-accepted
  const acceptButton = page.getByRole('button', { name: '接受邀请' });
  await expect(acceptButton).toBeVisible({ timeout: 5000 });

  // ============================================================================
  // RED MARKER — the actual accept implementation is not yet built
  // ============================================================================
  // The test below documents the expected behavior of the accept endpoint.
  // Clicking accept will trigger the implementation-gated behavior. Until the
  // accept endpoint and client flow exist, this test marks RED.

  await acceptButton.click();

  // This unreachable assertion serves as the RED contract marker.
  // Implementation must remove `expect.fail` and wire the full journey.
  expect.fail('IMPLEMENTATION_MISSING_INVITATION_ACCEPT: The invitation accept endpoint, client preview, auth return, solo acceptance, mismatch suppression, atomic membership creation, and after-accept routing are not yet implemented. This test describes the end-to-end contract per D-07/D-08.');

  // ============================================================================
  // D-08: EXACTLY ONCE — after successful accept, invitation is consumed
  // ============================================================================

  await withDatabase(async (db) => {
    const result = await db.query(
      `SELECT "consumed_at" FROM "invitations"
       WHERE "household_id" = $1 AND "email_canonical" = lower($2)
       ORDER BY "created_at" DESC LIMIT 1`,
      [household.id, invitee.email],
    );
    expect(result.rows.length).toBe(1);
    // Exactly once — consumed
    expect(result.rows[0].consumed_at).not.toBeNull();

    // Membership was created atomically
    const memberResult = await db.query(
      `SELECT "role" FROM "memberships"
       WHERE "household_id" = $1 AND "user_id" = $2`,
      [household.id, invitee.userId],
    );
    expect(memberResult.rows.length).toBe(1);
    expect(memberResult.rows[0].role).toBe('MEMBER');

    // Exactly one membership row (not duplicate)
    expect(memberResult.rows.length).toBe(1);
  });

  // --- After accept, user is in the household ---
  const postAcceptList = await request.get(`${API_ORIGIN}/api/v1/households`, {
    headers: { authorization: `Bearer ${invitee.accessToken}` },
  });
  expect(postAcceptList.status()).toBe(200);
  const postAcceptBody = (await postAcceptList.json()) as Array<{ id: string }>;
  const inListAfter = postAcceptBody.some((h) => h.id === household.id);
  expect(inListAfter).toBe(true);

  // --- User is redirected to the household (not left on invite page) ---
  await expect(page).toHaveURL(/\/households\//);

  // ============================================================================
  // D-08: MISMATCH — wrong email cannot accept
  // ============================================================================

  // Create another invitation for the invitee
  const secondToken = await withDatabase(async (db) =>
    seedPendingInvitation(
      owner.userId,
      household.ownerMembershipId,
      household.id,
      invitee.email,
      db,
    ),
  );

  // Log in as the stranger (different email)
  await page.goto(`${WEB_ORIGIN}/login`);
  await page.waitForTimeout(500);
  await page.getByLabel('邮箱地址').fill(stranger.email);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForTimeout(1000);

  // Navigate to the second invitation URL
  const secondInviteUrl = `${EMAIL_LINK_ORIGIN}/invite?token=${encodeURIComponent(secondToken)}`;
  await page.goto(secondInviteUrl);
  await page.waitForTimeout(1500);

  // --- Mismatch: household name and inviter are hidden ---
  // D-08: "不匹配时提示切换账户，且不泄露更多邀请细节"
  await expect(page.getByText('此邀请发给了另一个邮箱')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('温暖小家')).not.toBeVisible();
  await expect(page.getByText('家主')).not.toBeVisible();

  // --- Mismatch: "切换账户" is the only action ---
  await expect(page.getByRole('button', { name: '切换账户' })).toBeVisible({ timeout: 5000 });

  // --- Mismatch: invitation is NOT consumed ---
  await withDatabase(async (db) => {
    const result = await db.query(
      `SELECT "consumed_at" FROM "invitations"
       WHERE "household_id" = $1 AND "email_canonical" = lower($2)
       ORDER BY "created_at" DESC LIMIT 1`,
      [household.id, invitee.email],
    );
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
    // The latest invitation should still be unconsumed
    expect(result.rows[0].consumed_at).toBeNull();
  });

  // ============================================================================
  // TERMINAL STATES: invalid/unknown tokens expose only generic states
  // ============================================================================

  // --- Unknown/invalid token: generic "invalid or expired" page ---
  const invalidUrl = `${EMAIL_LINK_ORIGIN}/invite?token=not-a-valid-token-at-all`;
  await page.goto(invalidUrl);
  await page.waitForTimeout(1500);

  // D-07/D-08: unknown/terminal states use stable generic boundary
  await expect(page.getByText(/这个邀请无效或已失效/)).toBeVisible({ timeout: 5000 });
  // No household or inviter details leaked
  await expect(page.getByText('温暖小家')).not.toBeVisible();
  await expect(page.getByText('家主')).not.toBeVisible();
});
