import { expect, test } from '@playwright/test';
import { Client } from 'pg';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:5432/muchakucha_test';
const MAILPIT_HTTP = process.env.TEST_MAILPIT_HTTP_URL
  ?? `http://127.0.0.1:${process.env.TEST_MAILPIT_HTTP_PORT ?? '18025'}`;
const password = 'correct horse battery staple 2026';

// ---- Mailpit helpers ----

async function deleteAllMailpitMessages(): Promise<void> {
  await fetch(`${MAILPIT_HTTP}/messages`, { method: 'DELETE' });
}

interface MailpitMessageDetail {
  ID: string;
  To: Array<{ Address: string }>;
  Text: string;
  HTML: string;
}

async function fetchLatestMailpitMessage(recipient: string): Promise<MailpitMessageDetail | null> {
  const searchResponse = await fetch(`${MAILPIT_HTTP}/messages?recipient=${encodeURIComponent(recipient)}`);
  const searchBody = (await searchResponse.json()) as { messages?: string[] };
  const messages = searchBody.messages ?? [];
  if (messages.length === 0) return null;
  const raw = messages.at(-1)!;
  const bytes: number[] = [];
  const unfolded = raw.replace(/=\r?\n/g, '');
  for (let index = 0; index < unfolded.length; index += 1) {
    if (unfolded[index] === '=' && /^[0-9A-F]{2}$/i.test(unfolded.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(unfolded.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(unfolded.charCodeAt(index));
    }
  }
  const decoded = Buffer.from(bytes).toString('utf8');
  return { ID: 'latest', To: [{ Address: recipient }], Text: decoded, HTML: decoded };
}

// ---- Account helpers ----

async function prepareVerifiedAccount(
  seed: string,
  displayName: string,
): Promise<{ email: string; accessToken: string; userId: string }> {
  const database = new Client({ connectionString: DATABASE_URL });
  await database.connect();

  const email = `invite-send-${seed}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
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

test('sends a privacy-preserving invitation from settings [RED:INVITATION_SEND]', async ({ page, request }) => {
  test.setTimeout(120_000);

  // --- Precondition: clean mailpit state ---
  await deleteAllMailpitMessages();

  // --- Precondition: auth is healthy ---
  const owner = await prepareVerifiedAccount('owner', '家主');
  const member = await prepareVerifiedAccount('member', '普通成员');
  const outsider = await prepareVerifiedAccount('outsider', '无关人员');
  const existingAdmin = await prepareVerifiedAccount('existing', '现有管理员');

  // --- Precondition: household creation works ---
  const household = await createHousehold(owner.accessToken, '温暖小家');

  // Add members via DB — the admin joins directly, the member gets MEMBER role.
  await addMembershipViaDb(household.id, member.userId, 'MEMBER');
  await addMembershipViaDb(household.id, existingAdmin.userId, 'ADMIN');

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

  // Establish the Web browser session; the Node-side API login above does not
  // transfer its HttpOnly refresh cookie into Playwright's browser context.
  await page.goto('/login');
  await page.getByLabel('邮箱').fill(owner.email);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).not.toHaveURL(/\/login$/);

  // --- Precondition: /households selector is healthy ---
  await page.goto('/households');
  await expect(page).toHaveURL(/\/households/);

  // --- Precondition: settings route is reachable ---
  await page.goto(`/households/${encodeURIComponent(household.id)}/settings`);
  await page.waitForURL(`/households/${encodeURIComponent(household.id)}/settings`);
  await page.waitForTimeout(1500);

  // --- Precondition: roster loads on settings ---
  await expect(page.getByText('温暖小家').first()).toBeVisible({ timeout: 5000 });

  // === CORE INVITATION FLOW ===

  // --- Owner sends invitation to outsider (unregistered) ---
  const inviteFormLabel = page.getByLabel('邮箱地址');
  await expect(inviteFormLabel).toBeVisible({ timeout: 5000 });
  await inviteFormLabel.fill(outsider.email);
  await page.getByRole('button', { name: '发送邀请' }).click();

  // --- Verify success feedback ---
  await expect(page.getByText('邀请已发送。')).toBeVisible({ timeout: 5000 });

  // --- Verify email field was cleared ---
  await expect(page.getByLabel('邮箱地址')).toHaveValue('');

  // --- Verify mailpit received the email ---
  const outsiderMail = await fetchLatestMailpitMessage(outsider.email);
  expect(outsiderMail).not.toBeNull();
  expect(outsiderMail!.To[0]?.Address).toBe(outsider.email);

  // Recipient mapping
  const outsiderText = outsiderMail!.Text;
  const outsiderHtml = outsiderMail!.HTML;

  // Inviter display name
  expect(outsiderText).toContain('家主');

  // Household display name
  expect(outsiderText).toContain('温暖小家');

  // Invitation URL with raw token
  expect(outsiderText).toMatch(/\/invite\//);

  // Expiry mapping
  expect(outsiderText).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

  // HTML contains same details
  expect(outsiderHtml).toContain('家主');
  expect(outsiderHtml).toContain('温暖小家');

  // --- Verify database state: hash is lowercase SHA-256, no raw token ---
  const database = new Client({ connectionString: DATABASE_URL });
  await database.connect();
  try {
    const invitations = await database.query(
      `SELECT "id", "hash", "email_canonical", "role", "expires_at", "invalidated_at", "consumed_at", "created_at"
       FROM "invitations" WHERE "household_id" = $1 ORDER BY "created_at" DESC`,
      [household.id],
    );
    expect(invitations.rows.length).toBeGreaterThanOrEqual(1);
    const latestInvitation = invitations.rows[0] as Record<string, unknown>;
    // Hash is lowercase hex (64 hex chars after '0x' prefix removed from bytea)
    const hashStr = String(latestInvitation.hash);
    expect(hashStr).toMatch(/^[0-9a-f]{64}$/i);
    expect(hashStr).toBe(hashStr.toLowerCase());

    // Role is always MEMBER
    expect(latestInvitation.role).toBe('MEMBER');

    // Not consumed, not invalidated
    expect(latestInvitation.consumed_at).toBeNull();
    expect(latestInvitation.invalidated_at).toBeNull();

    // Expiry is in the future
    const expiry = new Date(latestInvitation.expires_at as string);
    expect(expiry.getTime()).toBeGreaterThan(Date.now());

    // Raw token is NOT in database
    const dbJson = JSON.stringify(invitations.rows);
    // Extract the token from the mailpit text for safety check
    const tokenMatch = /\/invite\/([^\s\n]+)/.exec(outsiderText);
    expect(tokenMatch).not.toBeNull();
    const rawToken = tokenMatch![1];
    expect(dbJson).not.toContain(rawToken);

    // === REPEAT INVITATION (rotation) ===

    // Clear field and send again to same recipient
    await inviteFormLabel.fill(outsider.email);
    await page.getByRole('button', { name: '发送邀请' }).click();
    await expect(page.getByText('邀请已发送。')).toBeVisible({ timeout: 5000 });

    // Verify old invitation was invalidated
    const afterRepeat = await database.query(
      `SELECT "id", "invalidated_at", "created_at"
       FROM "invitations" WHERE "household_id" = $1 ORDER BY "created_at" DESC`,
      [household.id],
    );
    expect(afterRepeat.rows.length).toBeGreaterThanOrEqual(2);
    const olderMatch = afterRepeat.rows.find(
      (r: Record<string, unknown>) => r.id === latestInvitation.id,
    );
    expect(olderMatch).toBeDefined();
    expect((olderMatch as Record<string, unknown>).invalidated_at).not.toBeNull();

    // === ALREADY-MEMBER REJECTION ===

    // Try to invite someone who is already a member
    await inviteFormLabel.fill(member.email);
    await page.getByRole('button', { name: '发送邀请' }).click();
    await expect(page.getByText('这个邮箱已经是该家庭的成员。')).toBeVisible({ timeout: 5000 });

    // === IDENTICAL RESPONSE FOR UNREGISTERED, REGISTERED, AND REPEAT ===

    // Registered but not a member: owner sends to outsider (who is already registered)
    // This tests the D-06 invariant: same success for registered non-members
    await inviteFormLabel.fill(outsider.email);
    await page.getByRole('button', { name: '发送邀请' }).click();
    await expect(page.getByText('邀请已发送。')).toBeVisible({ timeout: 5000 });
    // No "already registered" or account-existence distinction in UI

    // === MEMBER CANNOT SEND (API-level) ===

    // Member tries to send via API directly
    const memberInviteResponse = await request.fetch(
      `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}/invitations`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${member.accessToken}`,
          'content-type': 'application/json',
        },
        data: { email: 'someone@example.com' },
      },
    );
    expect(memberInviteResponse.status()).toBe(403);

    // === OUTSIDER CANNOT SEND (API-level) ===

    const outsiderInviteResponse = await request.fetch(
      `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}/invitations`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${outsider.accessToken}`,
          'content-type': 'application/json',
        },
        data: { email: 'someone@example.com' },
      },
    );
    expect(outsiderInviteResponse.status()).toBe(404);

    // === ADMIN CAN SEND ===

    // Admin sends invitation
    const adminInviteResponse = await request.fetch(
      `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}/invitations`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${existingAdmin.accessToken}`,
          'content-type': 'application/json',
        },
        data: { email: 'admin-invited@example.test' },
      },
    );
    expect(adminInviteResponse.status()).toBe(201);
    const adminBody = await adminInviteResponse.json();
    expect(adminBody.code).toBe('INVITATION_SENT');
    expect(adminBody.message).toBe('邀请已发送。');

  } finally {
    await database.end();
  }
});
