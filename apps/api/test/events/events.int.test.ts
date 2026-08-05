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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function eventApi(
  accessToken: string,
  householdId: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  payload?: unknown,
): Promise<{ statusCode: number; json: () => any }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (app.getHttpAdapter().getInstance() as any).inject({
    method,
    url: `/api/v1/households/${encodeURIComponent(householdId)}/events${path}`,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload !== undefined ? { payload } : {}),
  });
  return response as { statusCode: number; json: () => any };
}

beforeAll(async () => {
  passwordHash = await argon2.hash('events-fixture-password', {
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

describe('events CRUD API contract', () => {
  let owner: ActorFixture;
  let member: ActorFixture;
  let outsider: ActorFixture;
  let householdId: string;

  beforeEach(async () => {
    [owner, member, outsider] = await Promise.all([
      insertActor('owner-events@example.test', '事件主人'),
      insertActor('member-events@example.test', '事件成员'),
      insertActor('outsider-events@example.test', '无关人员'),
    ]);
    householdId = await createHousehold(owner.accessToken, '事件组');
    await addMemberViaDb(householdId, member, 'MEMBER');
  });

  test('creates a timed event', async () => {
    const start = new Date(Date.now() + 3600_000).toISOString();
    const end = new Date(Date.now() + 7200_000).toISOString();
    const response = await eventApi(owner.accessToken, householdId, 'POST', '', {
      title: '团队会议',
      description: '周会',
      startTime: start,
      endTime: end,
      location: '会议室A',
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.title).toBe('团队会议');
    expect(body.description).toBe('周会');
    expect(body.location).toBe('会议室A');
    expect(body.startTime).toBe(start);
    expect(body.endTime).toBe(end);
    expect(body.allDay).toBe(false);
    expect(body.householdId).toBe(householdId);
    expect(body.id).toBeDefined();
  });

  test('creates an all-day event', async () => {
    const dayStart = new Date(Date.now() + 86400_000);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86400_000);
    dayEnd.setHours(23, 59, 59, 999);

    const response = await eventApi(owner.accessToken, householdId, 'POST', '', {
      title: '全天活动',
      startTime: dayStart.toISOString(),
      endTime: dayEnd.toISOString(),
      allDay: true,
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().allDay).toBe(true);
  });

  test('retrieves an event by ID', async () => {
    const created = await eventApi(owner.accessToken, householdId, 'POST', '', {
      title: '测试事件',
      startTime: new Date(Date.now() + 3600_000).toISOString(),
      endTime: new Date(Date.now() + 7200_000).toISOString(),
    });
    const eventId = (created.json() as { id: string }).id;

    const response = await eventApi(owner.accessToken, householdId, 'GET', `/${encodeURIComponent(eventId)}`);
    expect(response.statusCode).toBe(200);
    expect(response.json().title).toBe('测试事件');
  });

  test('lists events with date range filtering', async () => {
    // Use UTC-fixed timestamps to avoid timezone edge cases in date-string filtering
    const day1 = new Date('2026-08-10T10:00:00Z');
    const day2 = new Date('2026-08-20T10:00:00Z');

    await eventApi(owner.accessToken, householdId, 'POST', '', {
      title: '八月活动',
      startTime: day1.toISOString(),
      endTime: new Date(day1.getTime() + 3600_000).toISOString(),
    });
    await eventApi(owner.accessToken, householdId, 'POST', '', {
      title: '更晚活动',
      startTime: day2.toISOString(),
      endTime: new Date(day2.getTime() + 3600_000).toISOString(),
    });

    // Wide range covers both
    const allResult = await eventApi(
      owner.accessToken, householdId, 'GET',
      '?startDate=2026-08-01&endDate=2026-08-31',
    );
    expect(allResult.statusCode).toBe(200);
    expect(allResult.json().events).toHaveLength(2);

    // Narrow range covers only the first
    const filteredResult = await eventApi(
      owner.accessToken, householdId, 'GET',
      '?startDate=2026-08-01&endDate=2026-08-15',
    );
    expect(filteredResult.statusCode).toBe(200);
    expect(filteredResult.json().events).toHaveLength(1);
    expect(filteredResult.json().events[0].title).toBe('八月活动');
  });

  test('updates an event', async () => {
    const created = await eventApi(owner.accessToken, householdId, 'POST', '', {
      title: '原始标题',
      startTime: new Date(Date.now() + 3600_000).toISOString(),
      endTime: new Date(Date.now() + 7200_000).toISOString(),
    });
    const eventId = (created.json() as { id: string }).id;

    const response = await eventApi(owner.accessToken, householdId, 'PUT', `/${encodeURIComponent(eventId)}`, {
      title: '已更新标题',
      location: '新地点',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().title).toBe('已更新标题');
    expect(response.json().location).toBe('新地点');

    // Verify
    const getResult = await eventApi(owner.accessToken, householdId, 'GET', `/${encodeURIComponent(eventId)}`);
    expect(getResult.json().title).toBe('已更新标题');
  });

  test('deletes an event', async () => {
    const created = await eventApi(owner.accessToken, householdId, 'POST', '', {
      title: '待删除',
      startTime: new Date(Date.now() + 3600_000).toISOString(),
      endTime: new Date(Date.now() + 7200_000).toISOString(),
    });
    const eventId = (created.json() as { id: string }).id;

    const deleteResult = await eventApi(owner.accessToken, householdId, 'DELETE', `/${encodeURIComponent(eventId)}`);
    expect(deleteResult.statusCode).toBe(204);

    const getResult = await eventApi(owner.accessToken, householdId, 'GET', `/${encodeURIComponent(eventId)}`);
    expect(getResult.statusCode).toBe(404);
  });

  test('rejects non-member from accessing events', async () => {
    const created = await eventApi(owner.accessToken, householdId, 'POST', '', {
      title: '私密事件',
      startTime: new Date(Date.now() + 3600_000).toISOString(),
      endTime: new Date(Date.now() + 7200_000).toISOString(),
    });
    const eventId = (created.json() as { id: string }).id;

    const listResult = await eventApi(outsider.accessToken, householdId, 'GET', '');
    expect(listResult.statusCode).toBe(404);
    expect(listResult.json().error.code).toBe('HOUSEHOLD_NOT_FOUND');

    const getResult = await eventApi(outsider.accessToken, householdId, 'GET', `/${encodeURIComponent(eventId)}`);
    expect(getResult.statusCode).toBe(404);

    const createResult = await eventApi(outsider.accessToken, householdId, 'POST', '', {
      title: '入侵',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
    });
    expect(createResult.statusCode).toBe(404);
  });

  test('validates required fields on create', async () => {
    // Missing title
    const noTitle = await eventApi(owner.accessToken, householdId, 'POST', '', {
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
    });
    expect(noTitle.statusCode).toBe(400);

    // Title too long
    const tooLong = await eventApi(owner.accessToken, householdId, 'POST', '', {
      title: 'x'.repeat(201),
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
    });
    expect(tooLong.statusCode).toBe(400);

    // End before start
    const badRange = await eventApi(owner.accessToken, householdId, 'POST', '', {
      title: '反向时间',
      startTime: new Date(Date.now() + 7200_000).toISOString(),
      endTime: new Date(Date.now() + 3600_000).toISOString(),
    });
    expect(badRange.statusCode).toBe(400);
  });

  test('requires a valid active access-token session', async () => {
    const missing = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: `/api/v1/households/${encodeURIComponent(householdId)}/events`,
    });
    const nonexistent = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: `/api/v1/households/${encodeURIComponent(householdId)}/events`,
      headers: {
        authorization: `Bearer ${await jwt.signAsync({ sub: randomUUID(), sid: randomUUID() })}`,
      },
    });
    expect([missing.statusCode, nonexistent.statusCode]).toEqual([401, 401]);
  });
});
