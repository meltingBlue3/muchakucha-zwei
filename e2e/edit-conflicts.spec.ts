import { fixtureEditPayload } from '../scripts/test-edit-version';
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

async function prepareAccount(
  seed: string,
  displayName: string,
): Promise<{ username: string; accessToken: string; userId: string }> {
  const database = new Client({ connectionString: DATABASE_URL });
  await database.connect();
  try {
    const username = `u-${seed.slice(0, 6)}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;

    const registerResponse = await fetch(`${API_ORIGIN}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ username, confirmPassword: password, password, platform: 'web' }),
    });
    expect(registerResponse.status).toBe(202);

    const userResult = await database.query(
      `UPDATE "User" SET "display_name" = $2 WHERE "username_canonical" = lower($1) RETURNING "id"`,
      [username, displayName],
    );
    const userId = userResult.rows[0]?.id as string;
    expect(userId).toBeDefined();

    const loginResponse = await fetch(`${API_ORIGIN}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ username, password, platform: 'web' }),
    });
    expect(loginResponse.status).toBe(200);
    const { accessToken } = (await loginResponse.json()) as { accessToken: string };
    expect(accessToken).toBeDefined();

    return { username, accessToken, userId };
  } finally {
    await database.end();
  }
}

async function apiCall(
  accessToken: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  body = await fixtureEditPayload(method, path, body, async (readPath) => {
    const snapshot = await fetch(`${API_ORIGIN}/api/v1${readPath}`, { headers: { authorization: `Bearer ${accessToken}` } });
    return snapshot.json();
  });
  const response = await fetch(`${API_ORIGIN}/api/v1${path}`, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text === '' ? null : JSON.parse(text) };
}

async function createHousehold(accessToken: string, name: string): Promise<string> {
  const response = await apiCall(accessToken, 'POST', '/households', { name });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

async function addMembershipViaDb(householdId: string, userId: string): Promise<void> {
  const database = new Client({ connectionString: DATABASE_URL });
  await database.connect();
  try {
    await database.query(
      `INSERT INTO "memberships" ("user_id", "household_id", "role") VALUES ($1, $2, 'MEMBER')`,
      [userId, householdId],
    );
  } finally {
    await database.end();
  }
}

test('notes: a stale draft survives a restart, and saving over the latest version is asked first', async ({ page }, testInfo) => {
  const owner = await prepareAccount('conf-owner', '共同作者');
  const writer = await prepareAccount('conf-edit', '草稿作者');
  const householdId = await createHousehold(owner.accessToken, '编辑冲突之家');
  await addMembershipViaDb(householdId, writer.userId);
  const root = `/households/${householdId}/notes`;
  const created = await apiCall(owner.accessToken, 'POST', root, { title: '共同内容', body: '- [ ] 牛奶' });
  expect(created.status).toBe(201);
  const path = `${root}/${created.body.id}`;
  const editor = page.getByRole('textbox', { name: '笔记内容', exact: true });
  const title = editor.locator('h1.note-title');
  const banner = page.getByRole('alert').filter({ hasText: '在你写的时候也改了这篇' });
  const saves = /\/api\/v1\/households\/[^/]+\/notes\/[^/]+$/;
  await loginUsernameFixture(page, writer.username, password, path);

  // Written while saves cannot get through: it stays on this device.
  await page.route(saves, route => route.request().method() === 'PUT' ? route.abort() : route.fallback());
  await title.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.type('我的未保存草稿');
  await expect(page.getByTestId('note-save-state')).toHaveText('未保存');
  expect((await apiCall(owner.accessToken, 'PUT', path, { title: '另一成员已保存' })).status).toBe(200);
  await page.unroute(saves);

  // After a restart the draft is back, and its save meets the other member's version.
  await page.reload();
  await expect(title).toHaveText('我的未保存草稿');
  await expect(banner).toContainText('共同作者在你写的时候也改了这篇。自动保存先停下，你的内容还在。');
  expect((await apiCall(owner.accessToken, 'GET', path)).body.title).toBe('另一成员已保存');
  await banner.getByRole('button', { name: '对照最新内容', exact: true }).click();
  await expect(banner.getByText('标题：另一成员已保存', { exact: true })).toBeVisible();
  await expect(title).toHaveText('我的未保存草稿');
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`conflict-${width}.png`), fullPage: true });
  }

  // Reading is not a lock: a newer save after the comparison is caught again.
  expect((await apiCall(owner.accessToken, 'PUT', path, { title: '又一次更新' })).status).toBe(200);
  await banner.getByRole('button', { name: '用我的版本保存', exact: true }).click();
  await expect(banner).toBeVisible();
  expect((await apiCall(owner.accessToken, 'GET', path)).body.title).toBe('又一次更新');
  await banner.getByRole('button', { name: '对照最新内容', exact: true }).click();
  await expect(banner.getByText('标题：又一次更新', { exact: true })).toBeVisible();
  await banner.getByRole('button', { name: '用我的版本保存', exact: true }).click();
  await expect(page.getByTestId('note-save-state')).toHaveText('已保存');
  await expect(banner).toHaveCount(0);
  expect((await apiCall(owner.accessToken, 'GET', path)).body).toMatchObject({ title: '我的未保存草稿', body: '- [ ] 牛奶', updatedBy: writer.userId });
});

for (const resource of ['tasks', 'events'] as const) {
  test(`${resource}: stale drafts survive restart and require reviewing the latest version`, async ({ page }) => {
    const owner = await prepareAccount('conf-owner', '共同作者');
    const editor = await prepareAccount('conf-edit', '草稿作者');
    const householdId = await createHousehold(owner.accessToken, '编辑冲突之家');
    await addMembershipViaDb(householdId, editor.userId);
    const root = `/households/${householdId}/${resource}`;
    const created = await apiCall(owner.accessToken, 'POST', root, {
      title: '共同内容', ...(resource === 'events' ? { startTime: '2030-01-01T09:00:00Z', endTime: '2030-01-01T10:00:00Z' } : {}),
    });
    expect(created.status).toBe(201);
    const path = `${root}/${created.body.id}`;
    const noun = resource === 'tasks' ? '任务' : '日程';
    const save = resource === 'tasks' ? '保存' : '保存';
    await loginUsernameFixture(page, editor.username, password, path);
    await page.getByRole('button', { name: `编辑${noun}`, exact: true }).click();
    await page.getByLabel(`${noun}标题`, { exact: true }).fill('我的未保存草稿');
    expect((await apiCall(owner.accessToken, 'PUT', path, { title: '另一成员已保存' })).status).toBe(200);
    await page.getByRole('button', { name: save, exact: true }).click();
    await expect(page.getByText('内容已更新，请查看最新版本后再保存。你的草稿已保留。', { exact: true })).toBeVisible();
    expect((await apiCall(owner.accessToken, 'GET', path)).body.title).toBe('另一成员已保存');
    await page.reload();
    await expect(page.getByLabel(`${noun}标题`, { exact: true })).toHaveValue('我的未保存草稿');
    await page.getByRole('button', { name: save, exact: true }).click();
    await expect(page.getByRole('button', { name: '查看最新内容', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '查看最新内容', exact: true }).click();
    await expect(page.getByText('标题：另一成员已保存', { exact: true })).toBeVisible();
    await expect(page.getByLabel(`${noun}标题`, { exact: true })).toHaveValue('我的未保存草稿');
    // Reading is not a lock: a new edit after review must still reject the old snapshot.
    expect((await apiCall(owner.accessToken, 'PUT', path, { title: '又一次更新' })).status).toBe(200);
    await page.getByRole('button', { name: '已查看，继续整理草稿', exact: true }).click();
    await page.getByRole('button', { name: save, exact: true }).click();
    await expect(page.getByRole('button', { name: '查看最新内容', exact: true })).toBeVisible();
    expect((await apiCall(owner.accessToken, 'GET', path)).body.title).toBe('又一次更新');
    await page.getByRole('button', { name: '查看最新内容', exact: true }).click();
    await expect(page.getByText('标题：又一次更新', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '已查看，继续整理草稿', exact: true }).click();
    await page.getByLabel(`${noun}标题`, { exact: true }).fill('对照后合并的内容');
    await page.getByRole('button', { name: save, exact: true }).click();
    await expect(page.getByRole('button', { name: `编辑${noun}`, exact: true })).toBeVisible();
    expect((await apiCall(owner.accessToken, 'GET', path)).body.title).toBe('对照后合并的内容');
  });
}
