import { expect, test } from '@playwright/test';
import { Client } from 'pg';

import { loginEmailFixture } from '../support/auth';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:5432/muchakucha_test';
const password = 'correct horse battery staple 2026';

async function prepareVerifiedAccount(seed: string): Promise<{ email: string; accessToken: string }> {
  const database = new Client({ connectionString: DATABASE_URL });
  await database.connect();
  try {
    const email = `today-${seed}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
    const registerResponse = await fetch(`${API_ORIGIN}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ email, displayName: '待安排测试', password, platform: 'web' }),
    });
    expect(registerResponse.status).toBe(202);

    await database.query(
      `UPDATE "User" SET "email_verified_at" = now() WHERE "email_canonical" = lower($1)`,
      [email],
    );

    const loginResponse = await fetch(`${API_ORIGIN}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ email, password, platform: 'web' }),
    });
    expect(loginResponse.status).toBe(200);
    const { accessToken } = (await loginResponse.json()) as { accessToken: string };
    return { email, accessToken };
  } finally {
    await database.end();
  }
}

async function apiCall(accessToken: string, method: string, path: string, body?: unknown) {
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

function todayAtNoonIso(): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
}

test('undated tasks appear under 待安排 instead of inflating 今日待办', async ({ page }) => {
  const owner = await prepareVerifiedAccount('owner');
  const household = await apiCall(owner.accessToken, 'POST', '/households', { name: '待安排之家' });
  expect(household.status).toBe(201);
  const householdId = household.body.id as string;

  const dueToday = await apiCall(owner.accessToken, 'POST', `/households/${householdId}/tasks`, {
    title: '今天要买菜',
    dueDate: todayAtNoonIso(),
  });
  expect(dueToday.status).toBe(201);

  for (const title of ['修水龙头', '整理阳台']) {
    const undated = await apiCall(owner.accessToken, 'POST', `/households/${householdId}/tasks`, { title });
    expect(undated.status).toBe(201);
  }

  await loginEmailFixture(page, owner.email, password, `/households/${encodeURIComponent(householdId)}/today`);

  // The headline group counts only work that is actually due today.
  await expect(page.getByRole('heading', { name: '今日待办 (1)' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '待安排 (2)' })).toBeVisible();

  // Splitting the group must not hide the undated work, only relabel it.
  await expect(page.getByRole('button', { name: /^任务：修水龙头/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^任务：整理阳台/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^任务：今天要买菜/ })).toBeVisible();

  // 待安排 sits between today's work and the collapsed upcoming section, so it
  // is reachable without expanding anything.
  await expect(page.getByRole('button', { name: /^查看后续安排/ })).toBeVisible();
});

test('completing a task is one tap and stays undoable on the card', async ({ page }) => {
  const owner = await prepareVerifiedAccount('complete');
  const household = await apiCall(owner.accessToken, 'POST', '/households', { name: '完成之家' });
  expect(household.status).toBe(201);
  const householdId = household.body.id as string;

  const created = await apiCall(owner.accessToken, 'POST', `/households/${householdId}/tasks`, {
    title: '洗碗',
    dueDate: todayAtNoonIso(),
  });
  expect(created.status).toBe(201);
  const taskId = created.body.id as string;

  // Start it, so undo has a non-default status to restore.
  const started = await apiCall(owner.accessToken, 'PUT', `/households/${householdId}/tasks/${taskId}`, {
    title: '洗碗',
    status: 'in_progress',
    priority: 'medium',
  });
  expect(started.status).toBe(200);

  await loginEmailFixture(page, owner.email, password, `/households/${encodeURIComponent(householdId)}/today`);
  await expect(page.getByText('进行中')).toBeVisible();

  // One tap finishes it — the old rotation needed two from here.
  await page.getByRole('button', { name: '完成任务' }).click();
  await expect(page.getByRole('button', { name: '撤销完成：洗碗' })).toBeVisible();

  const afterComplete = await apiCall(owner.accessToken, 'GET', `/households/${householdId}/tasks/${taskId}`);
  expect(afterComplete.body.status).toBe('completed');

  // Undo restores 进行中, not 待办: the card must still be on screen to offer it.
  await page.getByRole('button', { name: '撤销完成：洗碗' }).click();
  await expect(page.getByText('进行中')).toBeVisible();

  const afterUndo = await apiCall(owner.accessToken, 'GET', `/households/${householdId}/tasks/${taskId}`);
  expect(afterUndo.body.status).toBe('in_progress');
});

test('the detail page carries 进行中 as its own action', async ({ page }) => {
  const owner = await prepareVerifiedAccount('detail');
  const household = await apiCall(owner.accessToken, 'POST', '/households', { name: '详情之家' });
  expect(household.status).toBe(201);
  const householdId = household.body.id as string;

  const created = await apiCall(owner.accessToken, 'POST', `/households/${householdId}/tasks`, {
    title: '换灯泡',
    dueDate: todayAtNoonIso(),
  });
  expect(created.status).toBe(201);
  const taskId = created.body.id as string;

  await loginEmailFixture(
    page,
    owner.email,
    password,
    `/households/${encodeURIComponent(householdId)}/tasks/${encodeURIComponent(taskId)}`,
  );

  await page.getByRole('button', { name: '标记为进行中' }).click();

  await expect(page.getByRole('button', { name: '退回待办' })).toBeVisible();
  const afterStart = await apiCall(owner.accessToken, 'GET', `/households/${householdId}/tasks/${taskId}`);
  expect(afterStart.body.status).toBe('in_progress');
});
