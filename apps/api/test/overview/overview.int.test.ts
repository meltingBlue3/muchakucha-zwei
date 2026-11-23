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
}

interface ApiResponse {
  statusCode: number;
  json: () => any;
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

async function insertActor(username: string, displayName: string): Promise<ActorFixture> {
  const userId = randomUUID();
  const sessionId = randomUUID();
  await withDatabase(async (client) => {
    await client.query(
      `INSERT INTO "User" ("id", "username", "username_canonical", "display_name", "password_hash")
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, username, username.toLowerCase(), displayName, passwordHash],
    );
    await client.query(
      `INSERT INTO "AuthSession" ("id", "user_id", "absolute_ends_at")
       VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '30 days')`,
      [sessionId, userId],
    );
  });
  return { userId, accessToken: await jwt.signAsync({ sub: userId, sid: sessionId }) };
}

async function request(
  actor: ActorFixture,
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  payload?: unknown,
): Promise<ApiResponse> {
  return (app.getHttpAdapter().getInstance() as any).inject({
    method,
    url: `/api/v1${url}`,
    headers: {
      authorization: `Bearer ${actor.accessToken}`,
      ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload !== undefined ? { payload } : {}),
  });
}

async function createHousehold(actor: ActorFixture, name: string): Promise<string> {
  const response = await request(actor, 'POST', '/households', { name });
  expect(response.statusCode).toBe(201);
  return (response.json() as { id: string }).id;
}

async function addMember(householdId: string, actor: ActorFixture): Promise<void> {
  await withDatabase(async (client) => {
    await client.query(
      `INSERT INTO "memberships" ("user_id", "household_id", "role") VALUES ($1, $2, 'MEMBER')`,
      [actor.userId, householdId],
    );
  });
}

async function createTask(actor: ActorFixture, householdId: string, title: string, assigneeIds: string[] = []): Promise<string> {
  const response = await request(actor, 'POST', `/households/${householdId}/tasks`, { title, assigneeIds });
  expect(response.statusCode).toBe(201);
  return (response.json() as { id: string }).id;
}

async function createEvent(actor: ActorFixture, householdId: string, title: string, startTime: string, endTime: string): Promise<string> {
  const response = await request(actor, 'POST', `/households/${householdId}/events`, { title, startTime, endTime });
  expect(response.statusCode).toBe(201);
  return (response.json() as { id: string }).id;
}

async function storedChoice(userId: string): Promise<Record<string, boolean>> {
  return withDatabase(async (client) => {
    const result = await client.query<{ household_id: string; in_overview: boolean }>(
      `SELECT "household_id", "in_overview" FROM "memberships" WHERE "user_id" = $1`,
      [userId],
    );
    return Object.fromEntries(result.rows.map((row) => [row.household_id, row.in_overview]));
  });
}

beforeAll(async () => {
  passwordHash = await argon2.hash('overview-fixture-password', {
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

describe('总览 across households', () => {
  let me: ActorFixture;
  let dad: ActorFixture;
  let stranger: ActorFixture;
  let home: string;
  let parents: string;
  let grandma: string;
  let foreign: string;

  beforeEach(async () => {
    me = await insertActor('lin', '林晓');
    dad = await insertActor('dad', '爸爸');
    stranger = await insertActor('stranger', '路人');
    home = await createHousehold(me, '我们家');
    parents = await createHousehold(dad, '爸妈家');
    await addMember(parents, me);
    grandma = await createHousehold(me, '外婆家');
    foreign = await createHousehold(stranger, '别人家');
  });

  test('new memberships start in the 总览 and the list reports when each was joined', async () => {
    const response = await request(me, 'GET', '/households');
    expect(response.statusCode).toBe(200);
    const items = response.json() as Array<{ id: string; inOverview: boolean; joinedAt: string }>;
    expect(items.map((item) => item.id).sort()).toEqual([home, parents, grandma].sort());
    expect(items.every((item) => item.inOverview)).toBe(true);
    expect(items.every((item) => !Number.isNaN(Date.parse(item.joinedAt)))).toBe(true);
  });

  test('reads only the chosen households, never one the caller does not belong to', async () => {
    const mine = await createTask(me, home, '取干洗衣服', [me.userId]);
    const unassigned = await createTask(dad, parents, '给爸爸买降压药');
    const dadsOwn = await createTask(dad, parents, '交电费', [dad.userId]);
    const hidden = await createTask(me, grandma, '外婆家的事');
    await createTask(stranger, foreign, '别人家的事');

    const choose = await request(me, 'PUT', '/users/me/overview', { householdIds: [home, parents] });
    expect(choose.statusCode).toBe(200);
    expect((choose.json() as { householdIds: string[] }).householdIds.sort()).toEqual([home, parents].sort());
    expect(await storedChoice(me.userId)).toEqual({ [home]: true, [parents]: true, [grandma]: false });

    const tasks = await request(me, 'GET', '/users/me/overview/tasks');
    expect(tasks.statusCode).toBe(200);
    const body = tasks.json() as { tasks: Array<{ id: string; householdId: string }>; members: Array<{ householdId: string; userId: string; displayName: string }> };
    // Every task of the chosen households comes back; the client decides which to show.
    expect(body.tasks.map((task) => task.id).sort()).toEqual([mine, unassigned, dadsOwn].sort());
    expect(body.tasks.map((task) => task.id)).not.toContain(hidden);
    expect(body.members).toEqual(expect.arrayContaining([
      { householdId: parents, userId: dad.userId, displayName: '爸爸' },
      { householdId: parents, userId: me.userId, displayName: '林晓' },
      { householdId: home, userId: me.userId, displayName: '林晓' },
    ]));
    expect(body.members.some((member) => member.userId === stranger.userId)).toBe(false);

    const list = await request(me, 'GET', '/households');
    const flags = Object.fromEntries((list.json() as Array<{ id: string; inOverview: boolean }>).map((item) => [item.id, item.inOverview]));
    expect(flags).toEqual({ [home]: true, [parents]: true, [grandma]: false });
  });

  test('events come from the chosen households only, in one time order', async () => {
    const checkup = await createEvent(dad, parents, '陪妈妈复查', '2026-11-23T02:00:00.000Z', '2026-11-23T03:30:00.000Z');
    const meeting = await createEvent(me, home, '家长会', '2026-11-23T03:00:00.000Z', '2026-11-23T04:00:00.000Z');
    await createEvent(me, grandma, '外婆家聚会', '2026-11-23T04:00:00.000Z', '2026-11-23T05:00:00.000Z');
    await createEvent(stranger, foreign, '别人家的日程', '2026-11-23T04:00:00.000Z', '2026-11-23T05:00:00.000Z');
    await request(me, 'PUT', '/users/me/overview', { householdIds: [home, parents] });

    const response = await request(me, 'GET', '/users/me/overview/events?startDate=2026-11-23&endDate=2026-11-23&expandRecurring=true');
    expect(response.statusCode).toBe(200);
    expect((response.json() as { events: Array<{ id: string }> }).events.map((event) => event.id)).toEqual([checkup, meeting]);
  });

  test('refuses a household the caller does not belong to and keeps the earlier choice', async () => {
    await request(me, 'PUT', '/users/me/overview', { householdIds: [home] });

    const response = await request(me, 'PUT', '/users/me/overview', { householdIds: [home, foreign] });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_FAILED');
    expect(await storedChoice(me.userId)).toEqual({ [home]: true, [parents]: false, [grandma]: false });
  });

  test('refuses an empty choice, since at least one household stays in the 总览', async () => {
    const response = await request(me, 'PUT', '/users/me/overview', { householdIds: [] });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_FAILED');
    expect(await storedChoice(me.userId)).toEqual({ [home]: true, [parents]: true, [grandma]: true });
  });

  test('shows every household again when the only chosen one is left behind', async () => {
    await request(me, 'PUT', '/users/me/overview', { householdIds: [parents] });
    const leave = await request(me, 'POST', `/households/${parents}/leave`, {});
    expect(leave.statusCode).toBeLessThan(300);

    const homeTask = await createTask(me, home, '修阳台水龙头');
    const grandmaTask = await createTask(me, grandma, '外婆家的事');
    const tasks = await request(me, 'GET', '/users/me/overview/tasks');
    expect((tasks.json() as { tasks: Array<{ id: string }> }).tasks.map((task) => task.id).sort()).toEqual([homeTask, grandmaTask].sort());

    const list = await request(me, 'GET', '/households');
    expect((list.json() as Array<{ inOverview: boolean }>).every((item) => item.inOverview)).toBe(true);
  });

  test('a former member no longer reads that household', async () => {
    const parentsTask = await createTask(dad, parents, '买周末聚餐的水果');
    const leave = await request(me, 'POST', `/households/${parents}/leave`, {});
    expect(leave.statusCode).toBeLessThan(300);

    const tasks = await request(me, 'GET', '/users/me/overview/tasks');
    expect((tasks.json() as { tasks: Array<{ id: string }> }).tasks.map((task) => task.id)).not.toContain(parentsTask);
  });
});
