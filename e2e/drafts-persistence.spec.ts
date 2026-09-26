import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { Client } from 'pg';

import { loginUsernameFixture } from './support/auth';

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


const draftKey = (userId: string) => `muchakucha:drafts:v1:${userId}`;

test('note drafts survive browser restart, stay household scoped, and clear on save or discard', async ({ page, context }, testInfo) => {
  const account = await prepareAccount('draft', '草稿用户');
  const first = await createHousehold(account.accessToken, '草稿家庭 A');
  const second = await createHousehold(account.accessToken, '草稿家庭 B');
  await loginUsernameFixture(page, account.username, password);
  await page.goto(`${WEB_ORIGIN}/households/${first.id}/notes`);
  await page.getByRole('button', { name: '创建笔记', exact: true }).click();
  await page.getByLabel('笔记标题').fill('重启后继续');
  await page.getByLabel('笔记内容').fill('未保存的内容');
  await page.reload();
  await expect(page.getByLabel('笔记标题')).toHaveValue('重启后继续');
  await expect(page.getByLabel('笔记内容')).toHaveValue('未保存的内容');
  // Closing the tab destroys all in-memory React state; the new tab restores from disk.
  const fresh = await context.newPage();
  await page.close();
  await fresh.goto(`${WEB_ORIGIN}/households/${second.id}/notes/new`);
  await expect(fresh.getByLabel('笔记标题')).toHaveValue('');
  await fresh.goto(`${WEB_ORIGIN}/households/${first.id}/notes`);
  await fresh.getByRole('button', { name: '创建笔记', exact: true }).click();
  await expect(fresh.getByLabel('笔记标题')).toHaveValue('重启后继续');
  await fresh.getByRole('button', { name: '丢弃草稿', exact: true }).click();
  const dialog = fresh.getByRole('dialog', { name: '丢弃草稿？', exact: true });
  await expect(fresh.getByRole('dialog')).toHaveCount(1);
  for (const width of [320, 390, 1440]) {
    await fresh.setViewportSize({ width, height: 900 });
    await expect(dialog.getByRole('button', { name: '继续编辑', exact: true })).toBeVisible();
    expect((await new AxeBuilder({ page: fresh }).analyze()).violations).toEqual([]);
    expect(await fresh.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await fresh.screenshot({ path: testInfo.outputPath(`discard-${width}.png`) });
  }
  await dialog.getByRole('button', { name: '继续编辑', exact: true }).click();
  await expect(fresh.getByLabel('笔记标题')).toHaveValue('重启后继续');
  await fresh.getByRole('button', { name: '丢弃草稿', exact: true }).click();
  await dialog.getByRole('button', { name: '确认丢弃草稿', exact: true }).click();
  await expect(fresh).toHaveURL(new RegExp(`/households/${first.id}/notes$`));
  await fresh.goto(`${WEB_ORIGIN}/households/${first.id}/notes`);
  await fresh.getByRole('button', { name: '创建笔记', exact: true }).click();
  await expect(fresh.getByLabel('笔记标题')).toHaveValue('');
  await fresh.getByLabel('笔记标题').fill('保存后不再是草稿');
  await fresh.getByRole('button', { name: '创建', exact: true }).click();
  await expect(fresh).toHaveURL(new RegExp(`/households/${first.id}/notes$`));
  await fresh.goto(`${WEB_ORIGIN}/households/${first.id}/notes/new`);
  await expect(fresh.getByLabel('笔记标题')).toHaveValue('');
  expect(await fresh.evaluate((key) => localStorage.getItem(key), draftKey(account.userId))).toBeNull();
});

test('task and event drafts restore after reload, then logout clears account drafts', async ({ page }) => {
  const account = await prepareAccount('forms', '草稿用户');
  const household = await createHousehold(account.accessToken, '任务日程草稿');
  await loginUsernameFixture(page, account.username, password);
  for (const [resource, label, title] of [['tasks', '任务标题', '未保存任务'], ['events', '事件标题', '未保存日程']]) {
    await page.goto(`${WEB_ORIGIN}/households/${household.id}/${resource}/new`);
    await page.getByLabel(label).fill(title);
    await page.reload();
    await expect(page.getByLabel(label)).toHaveValue(title);
  }
  await page.getByRole('button', { name: '关闭创建日程', exact: true }).click();
  await page.getByRole('button', { name: '个人中心', exact: true }).click();
  await page.getByRole('menuitem', { name: '退出登录', exact: true }).click();
  await page.getByRole('dialog', { name: '退出登录', exact: true }).getByRole('button', { name: '确认退出登录', exact: true }).click();
  await expect(page).toHaveURL(/login/);
  expect(await page.evaluate((key) => localStorage.getItem(key), draftKey(account.userId))).toBeNull();
  await loginUsernameFixture(page, account.username, password);
  await page.goto(`${WEB_ORIGIN}/households/${household.id}/tasks/new`);
  await expect(page.getByLabel('任务标题')).toHaveValue('');
});

test('offline refresh retains drafts; confirmed household access loss removes only that household', async ({ page, request }) => {
  const owner = await prepareAccount('owner', '家主');
  const member = await prepareAccount('member', '草稿用户');
  const lost = await createHousehold(owner.accessToken, '即将离开的家庭');
  const kept = await createHousehold(member.accessToken, '保留的家庭');
  await addMembershipViaDb(lost.id, member.userId, 'MEMBER');
  await loginUsernameFixture(page, member.username, password);
  for (const household of [lost, kept]) {
    await page.goto(`${WEB_ORIGIN}/households/${household.id}/notes/new`);
    await page.getByLabel('笔记标题').fill(household.name);
  }
  // A failed membership request is not evidence of removal.
  await page.route(`${API_ORIGIN}/api/v1/households`, (route) => route.abort());
  await page.reload();
  await expect(page.getByLabel('笔记标题')).toHaveValue(kept.name);
  const before = await page.evaluate((key) => localStorage.getItem(key), draftKey(member.userId));
  expect(before).toContain(lost.id);
  await page.unroute(`${API_ORIGIN}/api/v1/households`);
  const response = await request.post(`${API_ORIGIN}/api/v1/households/${lost.id}/leave`, { headers: { authorization: `Bearer ${member.accessToken}` } });
  expect(response.status()).toBe(204);
  await page.reload();
  await expect(page.getByLabel('笔记标题')).toHaveValue(kept.name);
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), draftKey(member.userId))).not.toContain(lost.id);
  expect(await page.evaluate((key) => localStorage.getItem(key), draftKey(member.userId))).toContain(kept.id);
  await addMembershipViaDb(lost.id, member.userId, 'MEMBER');
  await page.goto(`${WEB_ORIGIN}/households/${lost.id}/notes/new`);
  await expect(page.getByLabel('笔记标题')).toHaveValue('');
});


test('retrying labels after restart uses the already-created task', async ({ page, request }) => {
  const account = await prepareAccount('partial', '标签重试用户');
  const household = await createHousehold(account.accessToken, '标签重试家庭');
  const labelResult = await request.post(`${API_ORIGIN}/api/v1/households/${household.id}/labels`, {
    headers: { authorization: `Bearer ${account.accessToken}` }, data: { name: '重启重试', color: '#EF4444' },
  });
  expect(labelResult.status()).toBe(201);
  const label = await labelResult.json();
  await loginUsernameFixture(page, account.username, password);
  await page.goto(`${WEB_ORIGIN}/households/${household.id}/tasks`);
  await page.getByRole('button', { name: '创建任务', exact: true }).click();
  await page.getByLabel('任务标题').fill('只创建一次');
  await page.getByLabel('选择标签 重启重试', { exact: true }).click();
  const labeling = new RegExp(`/households/${household.id}/tasks/[^/]+/labels$`);
  await page.route(labeling, (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNAVAILABLE' } }) }));
  await page.getByRole('button', { name: '创建任务', exact: true }).click();
  await expect(page.getByRole('button', { name: '重试保存标签', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: '重试保存标签', exact: true })).toBeVisible();
  await page.unroute(labeling);
  await page.getByRole('button', { name: '重试保存标签', exact: true }).click();
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), draftKey(account.userId))).toBeNull();
  const tasksResult = await request.get(`${API_ORIGIN}/api/v1/households/${household.id}/tasks`, { headers: { authorization: `Bearer ${account.accessToken}` } });
  const tasks = (await tasksResult.json()).tasks;
  expect(tasks).toHaveLength(1);
  expect(tasks[0].title).toBe('只创建一次');
  expect(tasks[0].labels.map((item: { id: string }) => item.id)).toContain(label.id);
});
