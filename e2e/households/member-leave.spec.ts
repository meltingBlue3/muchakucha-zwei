import AxeBuilder from '@axe-core/playwright';
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

async function getHouseholdMemberships(
  accessToken: string,
  householdId: string,
): Promise<Array<{ membershipId: string; userId: string; role: string }>> {
  const response = await fetch(
    `${API_ORIGIN}/api/v1/households/${encodeURIComponent(householdId)}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { members: Array<{ membershipId: string; userId: string; role: string }> };
  return body.members;
}


for (const role of ['MEMBER', 'ADMIN']) {
  test(`${role} can cancel or confirm leaving while the family retains shared content`, async ({ page, request }, testInfo) => {
    const owner = await prepareAccount('owner', '家主');
    const member = await prepareAccount('leaving', '退出成员');
    const household = await createHousehold(owner.accessToken, '退出测试家庭');
    await addMembershipViaDb(household.id, member.userId, role);
    const contents = [
      { resource: 'events', body: { title: '留下的日程', startTime: '2030-01-01T09:00:00Z', endTime: '2030-01-01T10:00:00Z' } },
      { resource: 'tasks', body: { title: '留下的任务' } },
      { resource: 'notes', body: { title: '留下的笔记', body: '家庭共享内容' } },
    ];
    const created: Array<{ resource: string; id: string; title: string }> = [];
    for (const content of contents) {
      const result = await request.post(`${API_ORIGIN}/api/v1/households/${household.id}/${content.resource}`, {
        headers: { authorization: `Bearer ${member.accessToken}` }, data: content.body,
      });
      expect(result.status()).toBe(201);
      created.push({ resource: content.resource, id: (await result.json()).id, title: content.body.title });
    }
    await loginUsernameFixture(page, member.username, password);
    await page.goto(`${WEB_ORIGIN}/households/${household.id}/settings`);
    await page.getByRole('button', { name: '离开家庭', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '确认离开家庭', exact: true })).toBeVisible();
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole('button', { name: '取消离开', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: '确认离开家庭', exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (role === 'MEMBER') await page.screenshot({ path: testInfo.outputPath(`leave-${width}.png`) });
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: '取消离开', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: '确认离开家庭', exact: true })).toBeFocused();
    await page.getByRole('button', { name: '取消离开', exact: true }).click();
    expect((await getHouseholdMemberships(owner.accessToken, household.id)).some((m) => m.userId === member.userId)).toBe(true);
    await page.getByRole('button', { name: '离开家庭', exact: true }).click();
    if (role === 'ADMIN') {
      const endpoint = `${API_ORIGIN}/api/v1/households/${household.id}/leave`;
      await page.route(endpoint, (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNAVAILABLE' } }) }));
      await page.getByRole('button', { name: '确认离开家庭', exact: true }).click();
      await expect(page.getByText('离开家庭失败，请检查网络连接后重试。', { exact: true })).toBeVisible();
      expect((await getHouseholdMemberships(owner.accessToken, household.id)).some((m) => m.userId === member.userId)).toBe(true);
      await page.unroute(endpoint);
    }
    const left = page.waitForResponse((r) => r.url().endsWith(`/households/${household.id}/leave`) && r.request().method() === 'POST');
    await page.getByRole('button', { name: '确认离开家庭', exact: true }).click();
    expect((await left).status()).toBe(204);
    await expect(page).toHaveURL(/\/households$/);
    expect((await getHouseholdMemberships(owner.accessToken, household.id)).some((m) => m.userId === member.userId)).toBe(false);
    for (const content of created) {
      const url = `${API_ORIGIN}/api/v1/households/${household.id}/${content.resource}/${content.id}`;
      expect((await request.get(url, { headers: { authorization: `Bearer ${member.accessToken}` } })).status()).toBe(404);
      const retained = await request.get(url, { headers: { authorization: `Bearer ${owner.accessToken}` } });
      expect(retained.status()).toBe(200);
      expect(await retained.json()).toMatchObject({ id: content.id, title: content.title, createdBy: member.userId });
    }
  });
}

test('owner transfers ownership in settings before choosing to leave', async ({ page }) => {
  const owner = await prepareAccount('owner', '家主');
  const successor = await prepareAccount('successor', '接任者');
  const household = await createHousehold(owner.accessToken, '先转让再退出');
  await addMembershipViaDb(household.id, successor.userId, 'MEMBER');
  await loginUsernameFixture(page, owner.username, password);
  await page.goto(`${WEB_ORIGIN}/households/${household.id}/settings`);
  await page.getByRole('button', { name: '离开家庭', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '离开家庭', exact: true });
  await dialog.getByRole('radio', { name: '接任者', exact: true }).click();
  await dialog.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(page).toHaveURL(/ownership\/transfer/);
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('button', { name: '确认转移所有权', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/households/${household.id}/settings$`));
  const roster = await getHouseholdMemberships(successor.accessToken, household.id);
  expect(roster.find((m) => m.userId === owner.userId)?.role).toBe('MEMBER');
  expect(roster.find((m) => m.userId === successor.userId)?.role).toBe('OWNER');
  await page.getByRole('button', { name: '离开家庭', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/households/${household.id}/leave\?`));
  await page.getByRole('button', { name: '确认离开家庭', exact: true }).click();
  await expect(page).toHaveURL(/\/households$/);
  expect((await getHouseholdMemberships(successor.accessToken, household.id)).some((m) => m.userId === owner.userId)).toBe(false);
});

test('owner manages roles and removal through one window without losing the settings entry', async ({ page }) => {
  const owner = await prepareAccount('window-owner', '家主');
  const member = await prepareAccount('window-member', '协作成员');
  const household = await createHousehold(owner.accessToken, '成员操作窗口');
  await addMembershipViaDb(household.id, member.userId, 'MEMBER');
  await loginUsernameFixture(page, owner.username, password, `/households/${household.id}/settings`);
  const role = async () => (await getHouseholdMemberships(owner.accessToken, household.id)).find(item => item.userId === member.userId)?.role;
  await page.getByRole('button', { name: '提升 协作成员', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.getByRole('button', { name: '保留成员权限', exact: true }).click();
  expect(await role()).toBe('MEMBER');
  await expect(page.getByRole('button', { name: '提升 协作成员', exact: true })).toBeFocused();
  await page.getByRole('button', { name: '提升 协作成员', exact: true }).click();
  await page.getByRole('button', { name: '确认提升为管理员', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/households/${household.id}/settings$`));
  expect(await role()).toBe('ADMIN');
  await page.getByRole('button', { name: '降级 协作成员', exact: true }).click();
  await page.getByRole('button', { name: '降级为成员', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/households/${household.id}/settings$`));
  expect(await role()).toBe('MEMBER');
  await page.getByRole('button', { name: '移除 协作成员', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  expect(await role()).toBe('MEMBER');
  await page.getByRole('button', { name: '移除 协作成员', exact: true }).click();
  await page.getByRole('button', { name: '移除成员', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/households/${household.id}/settings$`));
  expect(await role()).toBeUndefined();
});
