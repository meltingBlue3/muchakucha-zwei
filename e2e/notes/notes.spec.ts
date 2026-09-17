import { expect, test } from '@playwright/test';
import { Client } from 'pg';

import { loginEmailFixture } from '../support/auth';

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
  try {
    const email = `note-${seed}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;

    const registerResponse = await fetch(`${API_ORIGIN}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ email, displayName, password, platform: 'web' }),
    });
    expect(registerResponse.status).toBe(202);

    const userResult = await database.query(
      `UPDATE "User" SET "email_verified_at" = now() WHERE "email_canonical" = lower($1) RETURNING "id"`,
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
    const { accessToken } = (await loginResponse.json()) as { accessToken: string };
    expect(accessToken).toBeDefined();

    return { email, accessToken, userId };
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

test('creates, reads, edits, and deletes a note in the browser', async ({ page }) => {
  const owner = await prepareVerifiedAccount('owner', '笔记主人');
  const householdId = await createHousehold(owner.accessToken, '笔记之家');
  const notesPath = `/households/${encodeURIComponent(householdId)}/notes`;

  await loginEmailFixture(page, owner.email, password, notesPath);
  await expect(page.getByText('还没有笔记。点击上方按钮创建第一篇笔记。')).toBeVisible();

  // --- Create: an empty title stays on the form with an inline error ---
  await page.getByRole('button', { name: '创建笔记' }).click();
  await expect(page).toHaveURL(new RegExp(`${notesPath}/new$`));
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await expect(page.getByText('请输入笔记标题。')).toBeVisible();

  await page.getByLabel('笔记标题').fill('  暑假计划  ');
  await page.getByLabel('笔记内容').fill('游泳课\n看外婆');
  await page.getByRole('button', { name: '创建', exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`${notesPath}$`));
  const card = page.getByRole('button', { name: '笔记：暑假计划' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('游泳课');

  const listed = await apiCall(owner.accessToken, 'GET', `/households/${householdId}/notes`);
  expect(listed.body.total).toBe(1);
  expect(listed.body.notes[0]).toMatchObject({ title: '暑假计划', body: '游泳课\n看外婆', createdBy: owner.userId });
  const noteId = listed.body.notes[0].id as string;

  // --- Read ---
  await card.click();
  await expect(page).toHaveURL(new RegExp(`${notesPath}/${noteId}$`));
  const detail = page.getByRole('main', { name: '笔记详情' });
  await expect(detail.getByRole('heading', { name: '暑假计划' })).toBeVisible();
  await expect(detail.getByText('看外婆')).toBeVisible();

  // --- Edit: saving returns to the refreshed detail view ---
  await page.getByRole('button', { name: '编辑笔记' }).click();
  await expect(page).toHaveURL(new RegExp(`${notesPath}/${noteId}/edit$`));
  await expect(page.getByLabel('笔记标题')).toHaveValue('暑假计划');
  await page.getByLabel('笔记标题').fill('暑假安排');
  await page.getByLabel('笔记内容').fill('');
  await page.getByRole('button', { name: '保存', exact: true }).click();

  await expect(detail.getByRole('heading', { name: '暑假安排' })).toBeVisible();
  await expect(detail.getByText('这篇笔记还没有内容。')).toBeVisible();
  const updated = await apiCall(owner.accessToken, 'GET', `/households/${householdId}/notes/${noteId}`);
  expect(updated.body).toMatchObject({ title: '暑假安排', body: null });

  // --- Delete: cancel keeps the note, confirm returns to the empty list ---
  await page.getByRole('button', { name: '编辑笔记' }).click();
  await page.getByRole('button', { name: '删除笔记' }).click();
  await expect(page.getByText('确定要删除这个笔记吗？此操作不可撤销。')).toBeVisible();
  await page.getByRole('button', { name: '取消删除' }).click();
  await expect(page.getByText('确定要删除这个笔记吗？此操作不可撤销。')).toBeHidden();

  await page.getByRole('button', { name: '删除笔记' }).click();
  await page.getByRole('button', { name: '确认删除笔记' }).click();

  await expect(page).toHaveURL(new RegExp(`${notesPath}$`));
  await expect(page.getByText('还没有笔记。点击上方按钮创建第一篇笔记。')).toBeVisible();
  const afterDelete = await apiCall(owner.accessToken, 'GET', `/households/${householdId}/notes/${noteId}`);
  expect(afterDelete.status).toBe(404);
});

test('household members see notes shared by others, newest first', async ({ page }) => {
  const owner = await prepareVerifiedAccount('shared-owner', '笔记主人');
  const member = await prepareVerifiedAccount('shared-member', '笔记成员');
  const householdId = await createHousehold(owner.accessToken, '共享笔记之家');
  await addMembershipViaDb(householdId, member.userId);

  for (const title of ['Wi-Fi 密码', '垃圾分类时间']) {
    const created = await apiCall(owner.accessToken, 'POST', `/households/${householdId}/notes`, { title });
    expect(created.status).toBe(201);
  }

  await loginEmailFixture(page, member.email, password, `/households/${encodeURIComponent(householdId)}/notes`);

  const cards = page.getByRole('button', { name: /^笔记：/ });
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toHaveAccessibleName('笔记：垃圾分类时间');
  await expect(cards.nth(1)).toHaveAccessibleName('笔记：Wi-Fi 密码');
});
