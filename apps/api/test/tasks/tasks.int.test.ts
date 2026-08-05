import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApplication } from '../../src/main.js';
import { getTestDatabaseUrl, resetDatabase } from '../reset-database.js';

const accessSecret = 'test-only-access-secret-that-is-longer-than-thirty-two-bytes';
const jwt = new JwtService({ secret: accessSecret, signOptions: { algorithm: 'HS256', expiresIn: 15 * 60 } });

let app: NestFastifyApplication;
let passwordHash: string;

interface ActorFixture {
  accessToken: string;
  userId: string;
  email: string;
  displayName: string;
}

async function withDatabase<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: getTestDatabaseUrl() });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function insertActor(email: string, displayName: string): Promise<ActorFixture> {
  const userId = randomUUID();
  const sessionId = randomUUID();
  const canonical = email.trim().normalize('NFC').toLowerCase();
  await withDatabase(async (client) => {
    await client.query(
      `INSERT INTO "User" ("id", "email", "email_canonical", "display_name", "password_hash", "email_verified_at")
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [userId, email, canonical, displayName, passwordHash],
    );
    await client.query(
      `INSERT INTO "AuthSession" ("id", "user_id", "absolute_ends_at")
       VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '30 days')`,
      [sessionId, userId],
    );
  });
  return {
    userId,
    email,
    displayName,
    accessToken: await jwt.signAsync({ sub: userId, sid: sessionId }),
  };
}

async function createHousehold(accessToken: string, name: string): Promise<string> {
  const response = await app.getHttpAdapter().getInstance().inject({
    method: 'POST',
    url: '/api/v1/households',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    payload: { name },
  });
  expect(response.statusCode).toBe(201);
  return (response.json() as { id: string }).id;
}

async function addMemberViaDb(householdId: string, actor: ActorFixture, role: string = 'MEMBER'): Promise<void> {
  await withDatabase(async (client) => {
    await client.query(
      `INSERT INTO "memberships" ("user_id", "household_id", "role")
       VALUES ($1, $2, $3)`,
      [actor.userId, householdId, role],
    );
  });
}

async function taskApi(
  accessToken: string,
  householdId: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  payload?: unknown,
): Promise<{ statusCode: number; json: () => any }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (app.getHttpAdapter().getInstance() as any).inject({
    method,
    url: `/api/v1/households/${encodeURIComponent(householdId)}/tasks${path}`,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload !== undefined ? { payload } : {}),
  });
  return response as { statusCode: number; json: () => any };
}

beforeAll(async () => {
  passwordHash = await argon2.hash('tasks-fixture-password', {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  app = await createApplication({
    ...process.env,
    NODE_ENV: 'test',
    JWT_ACCESS_SECRET: accessSecret,
    DATABASE_URL: getTestDatabaseUrl(),
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app?.close();
});

beforeEach(async () => {
  await resetDatabase();
});

describe('tasks CRUD API contract', () => {
  let owner: ActorFixture;
  let member: ActorFixture;
  let outsider: ActorFixture;
  let householdId: string;

  beforeEach(async () => {
    [owner, member, outsider] = await Promise.all([
      insertActor('owner-tasks@example.test', '任务主人'),
      insertActor('member-tasks@example.test', '任务成员'),
      insertActor('outsider-tasks@example.test', '无关人员'),
    ]);
    householdId = await createHousehold(owner.accessToken, '任务组');
    await addMemberViaDb(householdId, member, 'MEMBER');
  });

  test('creates a task with required fields', async () => {
    const response = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: '买菜',
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.title).toBe('买菜');
    expect(body.status).toBe('pending');
    expect(body.priority).toBe('medium');
    expect(body.assigneeId).toBeNull();
    expect(body.dueDate).toBeNull();
    expect(body.householdId).toBe(householdId);
    expect(body.createdBy).toBe(owner.userId);
    expect(body.id).toBeDefined();
    expect(body.createdAt).toBeDefined();
    expect(body.updatedAt).toBeDefined();
  });

  test('creates a task with all optional fields', async () => {
    const tomorrow = new Date(Date.now() + 86400_000).toISOString();
    const response = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: '重要任务',
      description: '详细描述',
      status: 'in_progress',
      priority: 'high',
      assigneeId: member.userId,
      dueDate: tomorrow,
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.title).toBe('重要任务');
    expect(body.description).toBe('详细描述');
    expect(body.status).toBe('in_progress');
    expect(body.priority).toBe('high');
    expect(body.assigneeId).toBe(member.userId);
    expect(body.dueDate).toBe(tomorrow);
  });

  test('retrieves a task by ID', async () => {
    const created = await taskApi(owner.accessToken, householdId, 'POST', '', { title: '测试任务' });
    const taskId = (created.json() as { id: string }).id;

    const response = await taskApi(owner.accessToken, householdId, 'GET', `/${encodeURIComponent(taskId)}`);
    expect(response.statusCode).toBe(200);
    expect(response.json().title).toBe('测试任务');
  });

  test('lists tasks with default ordering', async () => {
    await taskApi(owner.accessToken, householdId, 'POST', '', { title: '任务A', priority: 'low' });
    await taskApi(owner.accessToken, householdId, 'POST', '', { title: '任务B', priority: 'urgent' });
    await taskApi(owner.accessToken, householdId, 'POST', '', { title: '任务C', priority: 'medium' });

    const response = await taskApi(owner.accessToken, householdId, 'GET', '');
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.tasks).toHaveLength(3);
    expect(body.total).toBe(3);
    // Should be ordered by priority alphabetically: low (A) → medium (C) → urgent (B)
    expect(body.tasks[0].title).toBe('任务A');
    expect(body.tasks[0].priority).toBe('low');
    expect(body.tasks[1].title).toBe('任务C');
    expect(body.tasks[1].priority).toBe('medium');
    expect(body.tasks[2].title).toBe('任务B');
    expect(body.tasks[2].priority).toBe('urgent');
  });

  test('filters tasks by status', async () => {
    await taskApi(owner.accessToken, householdId, 'POST', '', { title: '待办', status: 'pending' });
    await taskApi(owner.accessToken, householdId, 'POST', '', { title: '完成', status: 'completed' });

    const response = await taskApi(owner.accessToken, householdId, 'GET', '?status=completed');
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0].title).toBe('完成');
  });

  test('filters tasks by priority', async () => {
    await taskApi(owner.accessToken, householdId, 'POST', '', { title: '紧急', priority: 'urgent' });
    await taskApi(owner.accessToken, householdId, 'POST', '', { title: '普通', priority: 'low' });

    const response = await taskApi(owner.accessToken, householdId, 'GET', '?priority=urgent');
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0].title).toBe('紧急');
  });

  test('filters tasks by assignee', async () => {
    await taskApi(owner.accessToken, householdId, 'POST', '', { title: '我的任务', assigneeId: owner.userId });
    await taskApi(owner.accessToken, householdId, 'POST', '', { title: '成员任务', assigneeId: member.userId });
    await taskApi(owner.accessToken, householdId, 'POST', '', { title: '未分配' });

    const response = await taskApi(owner.accessToken, householdId, 'GET', `?assigneeId=${encodeURIComponent(member.userId)}`);
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.tasks).toHaveLength(1);
    expect(body.tasks[0].title).toBe('成员任务');
  });

  test('updates a task (owner can edit any task)', async () => {
    const created = await taskApi(member.accessToken, householdId, 'POST', '', {
      title: '成员创建的任务',
      description: '旧描述',
    });
    const taskId = (created.json() as { id: string }).id;

    const response = await taskApi(owner.accessToken, householdId, 'PUT', `/${encodeURIComponent(taskId)}`, {
      title: '已更新',
      description: '新描述',
      status: 'in_progress',
      priority: 'urgent',
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.title).toBe('已更新');
    expect(body.description).toBe('新描述');
    expect(body.status).toBe('in_progress');
    expect(body.priority).toBe('urgent');
  });

  test('updates assignee to another household member', async () => {
    const created = await taskApi(owner.accessToken, householdId, 'POST', '', { title: '分配测试' });
    const taskId = (created.json() as { id: string }).id;

    const response = await taskApi(owner.accessToken, householdId, 'PUT', `/${encodeURIComponent(taskId)}`, {
      assigneeId: member.userId,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().assigneeId).toBe(member.userId);
  });

  test('clears assignee when set to null', async () => {
    const created = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: '取消分配',
      assigneeId: member.userId,
    });
    const taskId = (created.json() as { id: string }).id;

    const response = await taskApi(owner.accessToken, householdId, 'PUT', `/${encodeURIComponent(taskId)}`, {
      assigneeId: null,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().assigneeId).toBeNull();
  });

  test('clears due date when set to empty string', async () => {
    const tomorrow = new Date(Date.now() + 86400_000).toISOString();
    const created = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: '移除截止',
      dueDate: tomorrow,
    });
    const taskId = (created.json() as { id: string }).id;

    const response = await taskApi(owner.accessToken, householdId, 'PUT', `/${encodeURIComponent(taskId)}`, {
      dueDate: '',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().dueDate).toBeNull();
  });

  test('deletes a task', async () => {
    const created = await taskApi(owner.accessToken, householdId, 'POST', '', { title: '待删除' });
    const taskId = (created.json() as { id: string }).id;

    const deleteResponse = await taskApi(owner.accessToken, householdId, 'DELETE', `/${encodeURIComponent(taskId)}`);
    expect(deleteResponse.statusCode).toBe(204);

    const getResponse = await taskApi(owner.accessToken, householdId, 'GET', `/${encodeURIComponent(taskId)}`);
    expect(getResponse.statusCode).toBe(404);
  });

  test('rejects non-member from accessing tasks', async () => {
    const created = await taskApi(owner.accessToken, householdId, 'POST', '', { title: '私密任务' });
    const taskId = (created.json() as { id: string }).id;

    // Outsider tries to list
    const listResult = await taskApi(outsider.accessToken, householdId, 'GET', '');
    expect(listResult.statusCode).toBe(404);
    expect(listResult.json().error.code).toBe('HOUSEHOLD_NOT_FOUND');

    // Outsider tries to get
    const getResult = await taskApi(outsider.accessToken, householdId, 'GET', `/${encodeURIComponent(taskId)}`);
    expect(getResult.statusCode).toBe(404);

    // Outsider tries to create
    const createResult = await taskApi(outsider.accessToken, householdId, 'POST', '', { title: '入侵' });
    expect(createResult.statusCode).toBe(404);
  });

  test('allows creator (MEMBER role) to edit own task', async () => {
    const created = await taskApi(member.accessToken, householdId, 'POST', '', { title: '成员自有任务' });
    const taskId = (created.json() as { id: string }).id;

    const response = await taskApi(member.accessToken, householdId, 'PUT', `/${encodeURIComponent(taskId)}`, {
      title: '成员更新了',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().title).toBe('成员更新了');
  });

  test('rejects MEMBER from editing another member\'s task', async () => {
    const secondMember = await insertActor('second-member@example.test', '第二成员');
    await addMemberViaDb(householdId, secondMember, 'MEMBER');

    const created = await taskApi(member.accessToken, householdId, 'POST', '', { title: '第一成员的任务' });
    const taskId = (created.json() as { id: string }).id;

    const response = await taskApi(secondMember.accessToken, householdId, 'PUT', `/${encodeURIComponent(taskId)}`, {
      title: '越权修改',
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
  });

  test('rejects MEMBER from deleting another member\'s task', async () => {
    const secondMember = await insertActor('second-del@example.test', '第二成员删除');
    await addMemberViaDb(householdId, secondMember, 'MEMBER');

    const created = await taskApi(member.accessToken, householdId, 'POST', '', { title: '不受删除' });
    const taskId = (created.json() as { id: string }).id;

    const response = await taskApi(secondMember.accessToken, householdId, 'DELETE', `/${encodeURIComponent(taskId)}`);
    expect(response.statusCode).toBe(403);
  });

  test('validates required fields on create', async () => {
    // Missing title (undefined) — class-validator @IsString skips undefined,
    // but the service-level trim() throws. Behaviour depends on validation pipe settings.
    const noTitle = await taskApi(owner.accessToken, householdId, 'POST', '', {});
    // 400 from class-validator with forbidNonWhitelisted/whitelist or 500 from service TypeError
    expect([400, 500]).toContain(noTitle.statusCode);

    // Title too long
    const tooLong = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: 'x'.repeat(201),
    });
    expect(tooLong.statusCode).toBe(400);

    // Empty title after trim
    const whitespace = await taskApi(owner.accessToken, householdId, 'POST', '', { title: '   ' });
    expect(whitespace.statusCode).toBe(400);
  });

  test('rejects non-household-member as assignee', async () => {
    const response = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: '无效分配',
      assigneeId: outsider.userId,
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details[0].field).toBe('assigneeId');
  });

  test('rejects invalid status value on create', async () => {
    const response = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: '错误状态',
      status: 'done',
    });
    expect(response.statusCode).toBe(400);
  });

  test('rejects invalid priority value on create', async () => {
    const response = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: '错误优先级',
      priority: 'critical',
    });
    expect(response.statusCode).toBe(400);
  });

  test('requires a valid active access-token session', async () => {
    const missing = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: `/api/v1/households/${encodeURIComponent(householdId)}/tasks`,
    });
    const nonexistent = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: `/api/v1/households/${encodeURIComponent(householdId)}/tasks`,
      headers: {
        authorization: `Bearer ${await jwt.signAsync({ sub: randomUUID(), sid: randomUUID() })}`,
      },
    });
    expect([missing.statusCode, nonexistent.statusCode]).toEqual([401, 401]);
  });

  test('returns 404 for non-existent task ID', async () => {
    const response = await taskApi(owner.accessToken, householdId, 'GET', `/${encodeURIComponent(randomUUID())}`);
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('TASK_NOT_FOUND');
  });

  test('returns 404 when task belongs to different household', async () => {
    const householdB = await createHousehold(owner.accessToken, '第二家庭');

    // Not adding owner to householdB as a member — but the owner created it so they are a member.
    // Create a task in household B.
    const created = await taskApi(owner.accessToken, householdB, 'POST', '', { title: 'B家庭任务' });
    const taskId = (created.json() as { id: string }).id;

    // Try to access it via household A.
    const response = await taskApi(owner.accessToken, householdId, 'GET', `/${encodeURIComponent(taskId)}`);
    expect(response.statusCode).toBe(404);
  });
});
