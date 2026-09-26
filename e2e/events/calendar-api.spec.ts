import { fixtureEditPayload } from '../../scripts/test-edit-version';
import { expect, test } from '@playwright/test';
import { Client } from 'pg';
import { loginUsernameFixture } from '../support/auth';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:5432/muchakucha_test';
const password = 'correct horse battery staple 2026';

// ---- Helpers ----

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

    await database.query(
      `UPDATE "User" SET "display_name" = $2 WHERE "username_canonical" = lower($1)`,
      [username, displayName],
    );

    const loginResponse = await fetch(`${API_ORIGIN}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ username, password, platform: 'web' }),
    });
    expect(loginResponse.status).toBe(200);
    const body: any = await loginResponse.json();
    expect(body.accessToken).toBeDefined();

    const meResponse = await fetch(`${API_ORIGIN}/api/v1/users/me`, {
      headers: { authorization: `Bearer ${body.accessToken}` },
    });
    const me: any = await meResponse.json();

    return { username, accessToken: body.accessToken, userId: me.id };
  } finally {
    await database.end();
  }
}

async function createHousehold(accessToken: string, name: string): Promise<string> {
  const response = await fetch(`${API_ORIGIN}/api/v1/households`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ name }),
  });
  expect(response.status).toBe(201);
  const body: any = await response.json();
  return body.id;
}

async function apiCall(
  accessToken: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  body = await fixtureEditPayload(method, path, body, async (readPath) => {
    const snapshot = await fetch(`${API_ORIGIN}${readPath}`, { headers: { authorization: `Bearer ${accessToken}` } });
    return snapshot.json();
  });
  const response = await fetch(`${API_ORIGIN}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const responseBody = method !== 'DELETE'
    ? await response.json().catch(() => null)
    : null;
  return { status: response.status, body: responseBody };
}

// ---- Tests ----

test.describe('Calendar Events API', () => {
  test('creates and retrieves an event', async () => {
    const owner = await prepareAccount('owner', '日历主人');
    const householdId = await createHousehold(owner.accessToken, '我的家');

    // Create event
    const start = new Date(Date.now() + 3600_000).toISOString();
    const end = new Date(Date.now() + 7200_000).toISOString();
    const createResult = await apiCall(owner.accessToken, 'POST', `/api/v1/households/${householdId}/events`, {
      title: '家庭聚餐',
      description: '每周例行聚餐',
      startTime: start,
      endTime: end,
      allDay: false,
      location: '万达广场',
    });
    expect(createResult.status).toBe(201);
    expect(createResult.body.title).toBe('家庭聚餐');
    expect(createResult.body.location).toBe('万达广场');

    // Retrieve the event
    const eventId = createResult.body.id;
    const getResult = await apiCall(owner.accessToken, 'GET', `/api/v1/households/${householdId}/events/${eventId}`);
    expect(getResult.status).toBe(200);
    expect(getResult.body.title).toBe('家庭聚餐');
    expect(getResult.body.description).toBe('每周例行聚餐');
  });

  test('lists events with date range filtering', async () => {
    const owner = await prepareAccount('list', '列表测试');
    const householdId = await createHousehold(owner.accessToken, '测试组');

    const now = new Date();
    const tomorrow = new Date(now.getTime() + 86400_000);
    const dayAfter = new Date(now.getTime() + 172800_000);

    // Create two events on different days
    await apiCall(owner.accessToken, 'POST', `/api/v1/households/${householdId}/events`, {
      title: '今日事件',
      startTime: now.toISOString(),
      endTime: new Date(now.getTime() + 3600_000).toISOString(),
    });
    await apiCall(owner.accessToken, 'POST', `/api/v1/households/${householdId}/events`, {
      title: '明天事件',
      startTime: tomorrow.toISOString(),
      endTime: new Date(tomorrow.getTime() + 3600_000).toISOString(),
    });

    // List with date range covering both
    const listResult = await apiCall(
      owner.accessToken,
      'GET',
      `/api/v1/households/${householdId}/events?startDate=${now.toISOString().split('T')[0]}&endDate=${dayAfter.toISOString().split('T')[0]}`,
    );
    expect(listResult.status).toBe(200);
    expect(listResult.body.events.length).toBe(2);

    // List with date range covering only today
    const todayResult = await apiCall(
      owner.accessToken,
      'GET',
      `/api/v1/households/${householdId}/events?startDate=${now.toISOString().split('T')[0]}&endDate=${now.toISOString().split('T')[0]}`,
    );
    expect(todayResult.status).toBe(200);
    expect(todayResult.body.events.length).toBe(1);
    expect(todayResult.body.events[0].title).toBe('今日事件');
  });

  test('updates an event', async () => {
    const owner = await prepareAccount('update', '更新测试');
    const householdId = await createHousehold(owner.accessToken, '更新组');

    const createResult = await apiCall(owner.accessToken, 'POST', `/api/v1/households/${householdId}/events`, {
      title: '原始标题',
      startTime: new Date(Date.now() + 3600_000).toISOString(),
      endTime: new Date(Date.now() + 7200_000).toISOString(),
    });
    const eventId = createResult.body.id;

    // Update
    const updateResult = await apiCall(owner.accessToken, 'PUT', `/api/v1/households/${householdId}/events/${eventId}`, {
      title: '已更新标题',
      location: '新地点',
    });
    expect(updateResult.status).toBe(200);
    expect(updateResult.body.title).toBe('已更新标题');
    expect(updateResult.body.location).toBe('新地点');

    // Verify
    const getResult = await apiCall(owner.accessToken, 'GET', `/api/v1/households/${householdId}/events/${eventId}`);
    expect(getResult.body.title).toBe('已更新标题');
  });

  test('deletes an event', async () => {
    const owner = await prepareAccount('delete', '删除测试');
    const householdId = await createHousehold(owner.accessToken, '删除组');

    const createResult = await apiCall(owner.accessToken, 'POST', `/api/v1/households/${householdId}/events`, {
      title: '待删除事件',
      startTime: new Date(Date.now() + 3600_000).toISOString(),
      endTime: new Date(Date.now() + 7200_000).toISOString(),
    });
    const eventId = createResult.body.id;

    // Delete
    const deleteResult = await apiCall(owner.accessToken, 'DELETE', `/api/v1/households/${householdId}/events/${eventId}`);
    expect(deleteResult.status).toBe(204);

    // Verify gone
    const getResult = await apiCall(owner.accessToken, 'GET', `/api/v1/households/${householdId}/events/${eventId}`);
    expect(getResult.status).toBe(404);
  });

  test('rejects non-member from accessing events', async () => {
    const owner = await prepareAccount('owner-sec', '安全主人');
    const outsider = await prepareAccount('outsider', '外人');
    const householdId = await createHousehold(owner.accessToken, '私密组');

    // Create event as owner
    const createResult = await apiCall(owner.accessToken, 'POST', `/api/v1/households/${householdId}/events`, {
      title: '私密事件',
      startTime: new Date(Date.now() + 3600_000).toISOString(),
      endTime: new Date(Date.now() + 7200_000).toISOString(),
    });
    const eventId = createResult.body.id;

    // Outsider tries to list
    const listResult = await apiCall(outsider.accessToken, 'GET', `/api/v1/households/${householdId}/events`);
    expect(listResult.status).toBe(404);

    // Outsider tries to get
    const getResult = await apiCall(outsider.accessToken, 'GET', `/api/v1/households/${householdId}/events/${eventId}`);
    expect(getResult.status).toBe(404);

    // Outsider tries to create
    const createAsOutsider = await apiCall(outsider.accessToken, 'POST', `/api/v1/households/${householdId}/events`, {
      title: '入侵事件',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
    });
    expect(createAsOutsider.status).toBe(404);
  });

  test('validates required fields on create', async () => {
    const owner = await prepareAccount('valid', '验证测试');
    const householdId = await createHousehold(owner.accessToken, '验证组');

    // Missing title
    const noTitle = await apiCall(owner.accessToken, 'POST', `/api/v1/households/${householdId}/events`, {
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
    });
    expect(noTitle.status).toBe(400);

    // Title too long
    const tooLong = await apiCall(owner.accessToken, 'POST', `/api/v1/households/${householdId}/events`, {
      title: 'x'.repeat(201),
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
    });
    expect(tooLong.status).toBe(400);

    // End before start
    const badRange = await apiCall(owner.accessToken, 'POST', `/api/v1/households/${householdId}/events`, {
      title: '反向时间',
      startTime: new Date(Date.now() + 7200_000).toISOString(),
      endTime: new Date(Date.now() + 3600_000).toISOString(),
    });
    expect(badRange.status).toBe(400);
  });

  test('creates all-day events', async () => {
    const owner = await prepareAccount('allday', '全天测试');
    const householdId = await createHousehold(owner.accessToken, '全天组');

    const createResult = await apiCall(owner.accessToken, 'POST', `/api/v1/households/${householdId}/events`, {
      title: '全天活动',
      startTime: new Date(Date.now() + 86400_000).toISOString(),
      endTime: new Date(Date.now() + 2 * 86400_000).toISOString(),
      allDay: true,
    });
    expect(createResult.status).toBe(201);
    expect(createResult.body.allDay).toBe(true);
  });
});


test('a household member edits a shared event in the browser', async ({ page }) => {
  const owner = await prepareAccount('edit-owner', '日程主人');
  const member = await prepareAccount('edit-member', '协作成员');
  const householdId = await createHousehold(owner.accessToken, '共享日程之家');
  const database = new Client({ connectionString: DATABASE_URL });
  await database.connect();
  try {
    await database.query('INSERT INTO "memberships" ("user_id", "household_id", "role") VALUES ($1, $2, $3)', [member.userId, householdId, 'MEMBER']);
  } finally {
    await database.end();
  }
  const created = await apiCall(owner.accessToken, 'POST', `/api/v1/households/${householdId}/events`, {
    title: '周末聚餐', startTime: new Date(Date.now() + 3600_000).toISOString(), endTime: new Date(Date.now() + 7200_000).toISOString(),
  });
  expect(created.status).toBe(201);
  const eventId = created.body.id as string;
  await loginUsernameFixture(page, member.username, password, `/households/${householdId}/events/${eventId}`);
  await page.getByRole('button', { name: '编辑事件', exact: true }).click();
  await page.getByLabel('事件标题').fill('家庭聚餐');
  await page.getByRole('button', { name: '更多日程选项' }).click();
  await page.getByLabel('地点', { exact: true }).fill('新餐厅');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('button', { name: '编辑事件', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '家庭聚餐', exact: true })).toBeVisible();
  const deleted = await apiCall(member.accessToken, 'DELETE', `/api/v1/households/${householdId}/events/${eventId}`);
  expect(deleted.status).toBe(403);
  const saved = await apiCall(owner.accessToken, 'GET', `/api/v1/households/${householdId}/events/${eventId}`);
  expect(saved.status).toBe(200);
  expect(saved.body).toMatchObject({ title: '家庭聚餐', location: '新餐厅', createdBy: owner.userId });
});
