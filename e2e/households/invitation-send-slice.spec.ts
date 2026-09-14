import { createHash } from 'node:crypto';

import { expect, test, type APIRequestContext } from '@playwright/test';
import { Client } from 'pg';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const DATABASE_URL = process.env.DATABASE_URL ??
  'postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:5432/muchakucha_test';
const password = 'family123';

async function createAccount(request: APIRequestContext, seed: string) {
  const username = `${seed}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
  const registered = await request.post(`${API_ORIGIN}/api/v1/auth/register`, {
    headers: { origin: WEB_ORIGIN },
    data: { username, password, confirmPassword: password, platform: 'web' },
  });
  expect(registered.status()).toBe(202);
  const { accessToken } = await registered.json() as { accessToken: string };
  const me = await request.get(`${API_ORIGIN}/api/v1/users/me`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  expect(me.status()).toBe(200);
  const { id: userId } = await me.json() as { id: string };
  return { username, accessToken, userId };
}

// Keep one test in this dedicated feature slice for the required-tests gate.
test('shares a username invitation from settings [RED:INVITATION_SEND]', async ({ browser, page, request }) => {
  test.setTimeout(120_000);
  const owner = await createAccount(request, 'owner');
  const member = await createAccount(request, 'member');
  const outsider = await createAccount(request, 'invitee');
  const admin = await createAccount(request, 'admin');
  const created = await request.post(`${API_ORIGIN}/api/v1/households`, {
    headers: { authorization: `Bearer ${owner.accessToken}` },
    data: { name: '温暖小家' },
  });
  expect(created.status()).toBe(201);
  const household = await created.json() as { id: string };
  const invitationsUrl = `${API_ORIGIN}/api/v1/households/${encodeURIComponent(household.id)}/invitations`;
  const database = new Client({ connectionString: DATABASE_URL });
  await database.connect();
  try {
    await database.query(
      `INSERT INTO "memberships" ("user_id", "household_id", "role") VALUES ($1, $2, 'MEMBER'), ($3, $2, 'ADMIN')`,
      [member.userId, household.id, admin.userId],
    );

    await page.goto('/login');
    await page.getByLabel('用户名', { exact: true }).fill(owner.username);
    await page.getByLabel('密码', { exact: true }).fill(password);
    await page.getByRole('button', { name: '登录' }).click();
    await expect(page).not.toHaveURL(/\/login$/);
    await page.goto(`/households/${encodeURIComponent(household.id)}/settings`);
    await expect(page.getByText('温暖小家').first()).toBeVisible();

    const inviteUsername = page.getByLabel('用户名', { exact: true });
    await inviteUsername.fill(outsider.username);
    await page.getByRole('button', { name: '发送邀请', exact: true }).click();
    await expect(page.getByText('邀请链接已生成，请发给家人。')).toBeVisible();
    await expect(inviteUsername).toHaveValue('');
    const shareLink = page.getByLabel('邀请链接', { exact: true });
    await expect(shareLink).toBeVisible();
    const firstUrl = (await shareLink.textContent())!;
    const rawToken = decodeURIComponent(new URL(firstUrl).pathname.split('/').at(-1)!);
    expect(firstUrl).toContain('/invite/');

    const stored = await database.query<{
      id: string;
      hash: string;
      recipient_user_id: string;
      role: string;
      consumed_at: Date | null;
      invalidated_at: Date | null;
    }>(
      `SELECT "id", "hash", "recipient_user_id", "role", "consumed_at", "invalidated_at"
       FROM "invitations" WHERE "household_id" = $1 ORDER BY "created_at" DESC`,
      [household.id],
    );
    expect(stored.rows).toHaveLength(1);
    const invitation = stored.rows[0]!;
    expect(invitation).toMatchObject({
      hash: createHash('sha256').update(rawToken).digest('hex'),
      recipient_user_id: outsider.userId,
      role: 'MEMBER',
      consumed_at: null,
      invalidated_at: null,
    });
    expect(JSON.stringify(stored.rows)).not.toContain(rawToken);

    await page.getByRole('button', { name: `重新发送邀请给 ${outsider.username}`, exact: true }).click();
    await expect(page.getByText('邀请链接已更新，请发给家人。')).toBeVisible();
    await expect(shareLink).not.toHaveText(firstUrl);
    const rotated = await database.query<{ invalidated_at: Date | null }>(
      `SELECT "invalidated_at" FROM "invitations" WHERE "id" = $1`,
      [invitation.id],
    );
    expect(rotated.rows[0]?.invalidated_at).not.toBeNull();

    await inviteUsername.fill(member.username);
    await page.getByRole('button', { name: '发送邀请', exact: true }).click();
    await expect(page.getByText('这个账户已经是该家庭的成员。')).toBeVisible();
    await inviteUsername.fill(`missing_${Date.now().toString(36)}`);
    await page.getByRole('button', { name: '发送邀请', exact: true }).click();
    await expect(page.getByText('未找到这个用户名，请让家人先注册账户。')).toBeVisible();

    const memberSend = await request.post(invitationsUrl, {
      headers: { authorization: `Bearer ${member.accessToken}` },
      data: { username: outsider.username },
    });
    expect(memberSend.status()).toBe(403);
    const outsiderSend = await request.post(invitationsUrl, {
      headers: { authorization: `Bearer ${outsider.accessToken}` },
      data: { username: owner.username },
    });
    expect(outsiderSend.status()).toBe(404);
    const adminSend = await request.post(invitationsUrl, {
      headers: { authorization: `Bearer ${admin.accessToken}` },
      data: { username: outsider.username },
    });
    expect(adminSend.status()).toBe(201);
    const acceptedInvitation = await adminSend.json() as { code: string; invitationUrl: string };
    expect(acceptedInvitation.code).toBe('INVITATION_SENT');

    const recipientContext = await browser.newContext();
    try {
      const recipientPage = await recipientContext.newPage();
      await recipientPage.goto(acceptedInvitation.invitationUrl);
      await recipientPage.getByRole('button', { name: '登录并继续' }).click();
      await recipientPage.getByLabel('用户名', { exact: true }).fill(outsider.username);
      await recipientPage.getByLabel('密码', { exact: true }).fill(password);
      await recipientPage.getByRole('button', { name: '登录' }).click();
      await expect(recipientPage).toHaveURL(/\/invite$/);
      await expect(recipientPage.getByRole('button', { name: '接受邀请', exact: true })).toBeVisible();
      const beforeAccept = await request.get(`${API_ORIGIN}/api/v1/households`, {
        headers: { authorization: `Bearer ${outsider.accessToken}` },
      });
      expect(await beforeAccept.json()).toEqual([]);
      await recipientPage.getByRole('button', { name: '接受邀请', exact: true }).click();
      await expect(recipientPage.getByRole('heading', { name: '邀请已接受' })).toBeVisible();
      const afterAccept = await request.get(`${API_ORIGIN}/api/v1/households`, {
        headers: { authorization: `Bearer ${outsider.accessToken}` },
      });
      expect(await afterAccept.json()).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: household.id, role: 'MEMBER' }),
      ]));
    } finally {
      await recipientContext.close();
    }
  } finally {
    await database.end();
  }
});
