import { fixtureEditPayload } from '../../scripts/test-edit-version';
import { expect, test } from '@playwright/test';

import { loginUsernameFixture } from '../support/auth';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const password = 'correct horse battery staple 2026';

async function prepareAccount(seed: string): Promise<{ username: string; accessToken: string }> {
  const username = `r-${seed.slice(0, 6)}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
  const registered = await fetch(`${API_ORIGIN}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
    body: JSON.stringify({ username, confirmPassword: password, password, platform: 'web' }),
  });
  expect(registered.status).toBe(202);
  const login = await fetch(`${API_ORIGIN}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
    body: JSON.stringify({ username, password, platform: 'web' }),
  });
  expect(login.status).toBe(200);
  return { username, accessToken: ((await login.json()) as { accessToken: string }).accessToken };
}

async function apiCall(accessToken: string, method: string, path: string, body?: unknown) {
  body = await fixtureEditPayload(method, path, body, async (readPath) => {
    const snapshot = await fetch(`${API_ORIGIN}/api/v1${readPath}`, { headers: { authorization: `Bearer ${accessToken}` } });
    return snapshot.json();
  });
  const response = await fetch(`${API_ORIGIN}/api/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${accessToken}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text === '' ? null : JSON.parse(text) };
}

test('a reminder set in the task form is stored as the person\'s own and scheduled for them', async ({ page }) => {
  const owner = await prepareAccount('remind');
  const household = await apiCall(owner.accessToken, 'POST', '/households', { name: '提醒之家' });
  expect(household.status).toBe(201);
  const householdId = household.body.id as string;
  const due = new Date();
  due.setDate(due.getDate() + 1);
  due.setHours(18, 0, 0, 0);
  const created = await apiCall(owner.accessToken, 'POST', `/households/${householdId}/tasks`, { title: '交水费', dueDate: due.toISOString() });
  expect(created.status).toBe(201);
  const taskId = created.body.id as string;

  await loginUsernameFixture(page, owner.username, password, `/households/${encodeURIComponent(householdId)}/tasks/${encodeURIComponent(taskId)}`);
  const detail = page.getByRole('dialog', { name: '任务详情', exact: true });
  await expect(detail.getByText('18:00（准时）', { exact: true })).toBeVisible();
  await detail.getByRole('button', { name: '编辑任务', exact: true }).click();
  const edit = page.getByRole('dialog', { name: '编辑任务', exact: true });
  await edit.getByRole('button', { name: '提醒我，准时提醒（默认）', exact: true }).click();
  await page.getByRole('radio', { name: '提前 1 小时', exact: true }).click();
  await edit.getByRole('button', { name: '保存', exact: true }).click();
  await expect(detail.getByText('17:00（提前 1 小时）', { exact: true })).toBeVisible();

  // Stored as a personal choice, without counting as an edit of the task.
  const stored = await apiCall(owner.accessToken, 'GET', `/households/${householdId}/tasks/${taskId}`);
  expect(stored.body.myReminder).toEqual({ mode: 'before', minutesBefore: 60, alarm: null });
  expect(stored.body.updatedAt).toBe(created.body.updatedAt);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const upcoming = await apiCall(owner.accessToken, 'GET', `/users/me/reminders?timeZone=${encodeURIComponent(timeZone)}`);
  expect(upcoming.body.reminders).toEqual([expect.objectContaining({
    key: `task:${taskId}`, itemId: taskId, title: '交水费', fireAt: new Date(due.getTime() - 3_600_000).toISOString(),
  })]);
});
