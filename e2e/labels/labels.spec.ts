import { expect, test } from '@playwright/test';
import { Client } from 'pg';

import { loginUsernameFixture } from '../support/auth';

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

test('manages labels and applies them to a task in the browser', async ({ page }) => {
  const owner = await prepareAccount('owner', '标签主人');
  const householdId = await createHousehold(owner.accessToken, '标签之家');
  const householdPath = `/households/${encodeURIComponent(householdId)}`;

  await loginUsernameFixture(page, owner.username, password, `${householdPath}/labels`);
  await expect(page.getByText('还没有标签，点击“创建”为日程和任务分类。')).toBeVisible();

  // --- Create with a chosen color ---
  await page.getByRole('button', { name: '创建标签', exact: true }).click();
  const createButton = page.getByRole('button', { name: '创建', exact: true });
  await createButton.click();
  await expect(page.getByText('请输入标签名称。')).toBeVisible();
  await page.getByLabel('标签名称', { exact: true }).fill('学校');
  await page.getByLabel('选择颜色 #277A72').click();
  await expect(page.getByRole('radio', { name: '选择颜色 #277A72' })).toBeChecked();
  await createButton.click();

  await expect(page.getByLabel('标签：学校')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  let labels = await apiCall(owner.accessToken, 'GET', `/households/${householdId}/labels`);
  expect(labels.body.labels).toEqual([expect.objectContaining({ name: '学校', color: '#277A72' })]);
  const labelId = labels.body.labels[0].id as string;

  // --- A duplicate name is rejected without losing the form ---
  await page.getByRole('button', { name: '创建标签', exact: true }).click();
  await page.getByLabel('标签名称', { exact: true }).fill('学校');
  await createButton.click();
  await expect(page.getByRole('alert')).toContainText('保存失败');
  await expect(page.getByLabel('标签名称', { exact: true })).toHaveValue('学校');
  await page.keyboard.press('Escape');

  // --- Rename and recolor ---
  await page.getByRole('button', { name: '更多操作：标签 学校', exact: true }).click();
  await page.getByRole('menuitem', { name: '编辑标签 学校', exact: true }).click();
  await expect(page.getByLabel('编辑标签名称')).toHaveValue('学校');
  await page.getByLabel('编辑标签名称').fill('学习');
  await page.getByLabel('选择颜色 #3B7DD8').click();
  await page.getByRole('button', { name: '保存' }).click();

  await expect(page.getByLabel('标签：学习')).toBeVisible();
  await expect(page.getByLabel('标签：学校')).toHaveCount(0);
  labels = await apiCall(owner.accessToken, 'GET', `/households/${householdId}/labels`);
  expect(labels.body.labels).toEqual([expect.objectContaining({ id: labelId, name: '学习', color: '#3B7DD8' })]);

  // --- Apply the label while creating a task ---
  await page.goto(`${householdPath}/tasks`);
  await page.getByRole('button', { name: '创建任务' }).click();
  await expect(page).toHaveURL(new RegExp(`${householdPath}/tasks/new$`));
  await page.getByLabel('任务标题').fill('准备开学用品');
  await page.getByLabel('选择标签 学习').click();
  await expect(page.getByLabel('取消选择标签 学习')).toBeVisible();
  await page.getByRole('button', { name: '创建', exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`${householdPath}/tasks$`));
  const tasks = await apiCall(owner.accessToken, 'GET', `/households/${householdId}/tasks`);
  const task = (tasks.body.tasks as Array<{ id: string; title: string; labels: Array<{ id: string }> }>).find(
    (candidate) => candidate.title === '准备开学用品',
  );
  expect(task?.labels.map((label) => label.id)).toEqual([labelId]);

  await page.goto(`${householdPath}/tasks/${task!.id}`);
  await expect(page.getByRole('dialog', { name: '任务详情' }).getByLabel('标签：学习')).toBeVisible();

  // --- Deleting the label asks for confirmation and detaches it from the task ---
  await page.goto(`${householdPath}/labels`);
  await page.getByRole('button', { name: '更多操作：标签 学习', exact: true }).click();
  await page.getByRole('menuitem', { name: '删除标签 学习', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '删除标签', exact: true })).toContainText('日程和任务本身会保留');
  await page.getByRole('button', { name: '取消删除' }).click();
  await expect(page.getByLabel('标签：学习')).toBeVisible();

  await page.getByRole('button', { name: '更多操作：标签 学习', exact: true }).click();
  await page.getByRole('menuitem', { name: '删除标签 学习', exact: true }).click();
  await page.getByRole('button', { name: '确认删除标签 学习' }).click();
  await expect(page.getByText('还没有标签，点击“创建”为日程和任务分类。')).toBeVisible();

  const detached = await apiCall(owner.accessToken, 'GET', `/households/${householdId}/tasks/${task!.id}`);
  expect(detached.body.labels).toEqual([]);
  await page.goto(`${householdPath}/tasks/${task!.id}`);
  await expect(page.getByRole('heading', { name: '准备开学用品' })).toBeVisible();
  await expect(page.getByLabel('标签：学习')).toHaveCount(0);
});
