import { expect, test } from '@playwright/test';
import { Client } from 'pg';

const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://127.0.0.1:8081';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://muchakucha_test:muchakucha_test_only@127.0.0.1:5432/muchakucha_test';
const password = 'correct horse battery staple 2026';

// ---- Helpers ----

async function prepareVerifiedAccount(
  seed: string,
  displayName: string,
): Promise<{ email: string; accessToken: string; userId: string }> {
  const database = new Client({ connectionString: DATABASE_URL });
  await database.connect();
  try {
    const email = `task-${seed}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;

    const registerResponse = await fetch(`${API_ORIGIN}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: WEB_ORIGIN },
      body: JSON.stringify({ email, displayName, password, platform: 'web' }),
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
    const body: any = await loginResponse.json();
    expect(body.accessToken).toBeDefined();

    const meResponse = await fetch(`${API_ORIGIN}/api/v1/users/me`, {
      headers: { authorization: `Bearer ${body.accessToken}` },
    });
    const me: any = await meResponse.json();

    return { email, accessToken: body.accessToken, userId: me.id };
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
  const response = await fetch(`${API_ORIGIN}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const responseBody = method !== 'DELETE'
    ? await response.json().catch(() => null)
    : null;
  return { status: response.status, body: responseBody };
}

async function addMemberViaDb(householdId: string, userId: string, role: string = 'MEMBER'): Promise<void> {
  const database = new Client({ connectionString: DATABASE_URL });
  await database.connect();
  try {
    await database.query(
      `INSERT INTO "memberships" ("user_id", "household_id", "role") VALUES ($1, $2, $3)`,
      [userId, householdId, role],
    );
  } finally {
    await database.end();
  }
}

// ---- Tests ----

test.describe('Tasks API', () => {
  test('creates and retrieves a task', async () => {
    const owner = await prepareVerifiedAccount('owner', '任务主人');
    const householdId = await createHousehold(owner.accessToken, '任务之家');

    // Create task
    const createResult = await apiCall(owner.accessToken, 'POST', `/api/v1/households/${householdId}/tasks`, {
      title: '完成周报',
      description: '总结本周工作进展',
      priority: 'high',
    });
    expect(createResult.status).toBe(201);
    expect(createResult.body.title).toBe('完成周报');
    expect(createResult.body.status).toBe('pending');
    expect(createResult.body.priority).toBe('high');

    // Retrieve the task
    const taskId = createResult.body.id;
    const getResult = await apiCall(owner.accessToken, 'GET', `/api/v1/households/${householdId}/tasks/${taskId}`);
    expect(getResult.status).toBe(200);
    expect(getResult.body.title).toBe('完成周报');
    expect(getResult.body.description).toBe('总结本周工作进展');
  });

  test('lists tasks with filtering', async () => {
    const owner = await prepareVerifiedAccount('list', '列表');
    const member = await prepareVerifiedAccount('list-mem', '列表成员');
    const householdId = await createHousehold(owner.accessToken, '列表组');
    await addMemberViaDb(householdId, member.userId);

    // Create tasks with different statuses and assignees
    await apiCall(owner.accessToken, 'POST', `/api/v1/households/${householdId}/tasks`, {
      title: '待办任务', status: 'pending', assigneeId: owner.userId,
    });
    await apiCall(owner.accessToken, 'POST', `/api/v1/households/${householdId}/tasks`, {
      title: '已完成', status: 'completed', assigneeId: member.userId,
    });
    await apiCall(owner.accessToken, 'POST', `/api/v1/households/${householdId}/tasks`, {
      title: '高优先级', priority: 'urgent',
    });

    // Filter by status
    const statusResult = await apiCall(owner.accessToken, 'GET', `/api/v1/households/${householdId}/tasks?status=pending`);
    expect(statusResult.status).toBe(200);
    expect(statusResult.body.tasks.length).toBe(1);
    expect(statusResult.body.tasks[0].title).toBe('待办任务');

    // Filter by assignee
    const assigneeResult = await apiCall(owner.accessToken, 'GET', `/api/v1/households/${householdId}/tasks?assigneeId=${member.userId}`);
    expect(assigneeResult.status).toBe(200);
    expect(assigneeResult.body.tasks.length).toBe(1);
    expect(assigneeResult.body.tasks[0].title).toBe('已完成');
  });

  test('updates and completes a task', async () => {
    const owner = await prepareVerifiedAccount('update', '更新');
    const householdId = await createHousehold(owner.accessToken, '更新组');

    const createResult = await apiCall(owner.accessToken, 'POST', `/api/v1/households/${householdId}/tasks`, {
      title: '学习任务',
    });
    const taskId = createResult.body.id;

    // Update status to in_progress
    const updateResult = await apiCall(owner.accessToken, 'PUT', `/api/v1/households/${householdId}/tasks/${taskId}`, {
      status: 'in_progress',
      priority: 'urgent',
    });
    expect(updateResult.status).toBe(200);
    expect(updateResult.body.status).toBe('in_progress');
    expect(updateResult.body.priority).toBe('urgent');

    // Complete the task
    const completeResult = await apiCall(owner.accessToken, 'PUT', `/api/v1/households/${householdId}/tasks/${taskId}`, {
      status: 'completed',
    });
    expect(completeResult.status).toBe(200);
    expect(completeResult.body.status).toBe('completed');
  });

  test('deletes a task', async () => {
    const owner = await prepareVerifiedAccount('delete', '删除');
    const householdId = await createHousehold(owner.accessToken, '删除组');

    const createResult = await apiCall(owner.accessToken, 'POST', `/api/v1/households/${householdId}/tasks`, {
      title: '待删除任务',
    });
    const taskId = createResult.body.id;

    // Delete
    const deleteResult = await apiCall(owner.accessToken, 'DELETE', `/api/v1/households/${householdId}/tasks/${taskId}`);
    expect(deleteResult.status).toBe(204);

    // Verify gone
    const getResult = await apiCall(owner.accessToken, 'GET', `/api/v1/households/${householdId}/tasks/${taskId}`);
    expect(getResult.status).toBe(404);
  });

  test('rejects non-member from accessing tasks', async () => {
    const owner = await prepareVerifiedAccount('owner-sec', '安全');
    const outsider = await prepareVerifiedAccount('outsider', '外人');
    const householdId = await createHousehold(owner.accessToken, '私密组');

    // Create task as owner
    const createResult = await apiCall(owner.accessToken, 'POST', `/api/v1/households/${householdId}/tasks`, {
      title: '私密任务',
    });
    const taskId = createResult.body.id;

    // Outsider tries to list
    const listResult = await apiCall(outsider.accessToken, 'GET', `/api/v1/households/${householdId}/tasks`);
    expect(listResult.status).toBe(404);

    // Outsider tries to get
    const getResult = await apiCall(outsider.accessToken, 'GET', `/api/v1/households/${householdId}/tasks/${taskId}`);
    expect(getResult.status).toBe(404);

    // Outsider tries to create
    const createAsOutsider = await apiCall(outsider.accessToken, 'POST', `/api/v1/households/${householdId}/tasks`, {
      title: '入侵',
    });
    expect(createAsOutsider.status).toBe(404);
  });

  test('validates required fields', async () => {
    const owner = await prepareVerifiedAccount('valid', '验证');
    const householdId = await createHousehold(owner.accessToken, '验证组');

    // Title too long
    const tooLong = await apiCall(owner.accessToken, 'POST', `/api/v1/households/${householdId}/tasks`, {
      title: 'x'.repeat(201),
    });
    expect(tooLong.status).toBe(400);

    // Invalid status
    const badStatus = await apiCall(owner.accessToken, 'POST', `/api/v1/households/${householdId}/tasks`, {
      title: '测试',
      status: 'done',
    });
    expect(badStatus.status).toBe(400);

    // Invalid priority
    const badPriority = await apiCall(owner.accessToken, 'POST', `/api/v1/households/${householdId}/tasks`, {
      title: '测试',
      priority: 'critical',
    });
    expect(badPriority.status).toBe(400);
  });

  test('enforces MEMBER can only edit own tasks', async () => {
    const owner = await prepareVerifiedAccount('owner-perm', '权限主人');
    const memberA = await prepareVerifiedAccount('mem-a', '成员A');
    const memberB = await prepareVerifiedAccount('mem-b', '成员B');
    const householdId = await createHousehold(owner.accessToken, '权限组');
    await addMemberViaDb(householdId, memberA.userId);
    await addMemberViaDb(householdId, memberB.userId);

    // Member A creates a task
    const createResult = await apiCall(memberA.accessToken, 'POST', `/api/v1/households/${householdId}/tasks`, {
      title: 'A的任务',
    });
    const taskId = createResult.body.id;

    // Member B tries to edit — should be rejected
    const editResult = await apiCall(memberB.accessToken, 'PUT', `/api/v1/households/${householdId}/tasks/${taskId}`, {
      title: 'B试图改',
    });
    expect(editResult.status).toBe(403);

    // Owner can edit any task
    const ownerEdit = await apiCall(owner.accessToken, 'PUT', `/api/v1/households/${householdId}/tasks/${taskId}`, {
      title: '主人改了',
    });
    expect(ownerEdit.status).toBe(200);
  });
});
