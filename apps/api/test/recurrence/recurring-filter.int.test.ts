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

interface ActorFixture { accessToken: string; userId: string }

// Fixture helpers copied verbatim from materializer.int.test.ts. This phase's
// established convention is per-file fixture duplication rather than a
// shared helper file — see 07-09-PLAN.md.
async function withDatabase<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: getTestDatabaseUrl() });
  await client.connect();
  try { return await run(client); } finally { await client.end(); }
}

async function insertActor(email: string): Promise<ActorFixture> {
  const userId = randomUUID();
  const sessionId = randomUUID();
  await withDatabase(async (client) => {
    await client.query(
      `INSERT INTO "User" ("id", "email", "email_canonical", "display_name", "password_hash", "email_verified_at")
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [userId, email, email.toLowerCase(), 'recurring-filter actor', passwordHash],
    );
    await client.query(
      `INSERT INTO "AuthSession" ("id", "user_id", "absolute_ends_at")
       VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '30 days')`,
      [sessionId, userId],
    );
  });
  return { userId, accessToken: await jwt.signAsync({ sub: userId, sid: sessionId }) };
}

async function createHousehold(accessToken: string): Promise<string> {
  const response = await app.getHttpAdapter().getInstance().inject({
    method: 'POST',
    url: '/api/v1/households',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    payload: { name: 'Recurring filter household' },
  });
  expect(response.statusCode).toBe(201);
  return (response.json() as { id: string }).id;
}

async function createRecurringTask(actor: ActorFixture, householdId: string): Promise<string> {
  const response = await app.getHttpAdapter().getInstance().inject({
    method: 'POST',
    url: `/api/v1/households/${householdId}/tasks`,
    headers: { authorization: `Bearer ${actor.accessToken}`, 'content-type': 'application/json' },
    payload: {
      title: 'Recurring filter daily task',
      recurrence: { freq: 'daily', startsOn: new Date().toISOString().slice(0, 10), timezone: 'UTC' },
    },
  });
  expect(response.statusCode).toBe(201);
  const body = response.json() as { id: string; recurrenceRuleId: string | null };
  expect(body.recurrenceRuleId).not.toBeNull();
  return body.id;
}

async function createPlainTask(actor: ActorFixture, householdId: string): Promise<string> {
  const response = await app.getHttpAdapter().getInstance().inject({
    method: 'POST',
    url: `/api/v1/households/${householdId}/tasks`,
    headers: { authorization: `Bearer ${actor.accessToken}`, 'content-type': 'application/json' },
    payload: { title: 'Recurring filter plain task' },
  });
  expect(response.statusCode).toBe(201);
  const body = response.json() as { id: string; recurrenceRuleId: string | null };
  expect(body.recurrenceRuleId).toBeNull();
  return body.id;
}

interface TaskListResult { tasks: Array<{ id: string; recurrenceRuleId: string | null }>; total: number }

async function listTasks(
  actor: ActorFixture,
  householdId: string,
  recurring?: 'true' | 'false',
): Promise<{ statusCode: number; body: unknown }> {
  const qs = recurring === undefined ? '' : `?recurring=${recurring}`;
  const response = await app.getHttpAdapter().getInstance().inject({
    method: 'GET',
    url: `/api/v1/households/${householdId}/tasks${qs}`,
    headers: { authorization: `Bearer ${actor.accessToken}` },
  });
  return { statusCode: response.statusCode, body: response.json() as unknown };
}

beforeAll(async () => {
  passwordHash = await argon2.hash('recurring-filter-fixture-password', {
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

afterAll(async () => { await app?.close(); });
beforeEach(async () => { await resetDatabase(); });

describe('recurring list filter (D-15) — tasks', () => {
  test('?recurring=true returns only the recurring task', async () => {
    const actor = await insertActor('recurring-true-tasks@example.test');
    const householdId = await createHousehold(actor.accessToken);
    const recurringTaskId = await createRecurringTask(actor, householdId);
    await createPlainTask(actor, householdId);

    const { statusCode, body } = await listTasks(actor, householdId, 'true');
    expect(statusCode).toBe(200);
    const result = body as TaskListResult;
    expect(result.tasks.map((t) => t.id)).toEqual([recurringTaskId]);
    expect(result.tasks.every((t) => t.recurrenceRuleId !== null)).toBe(true);
  });

  test('?recurring=false returns only the plain task', async () => {
    const actor = await insertActor('recurring-false-tasks@example.test');
    const householdId = await createHousehold(actor.accessToken);
    await createRecurringTask(actor, householdId);
    const plainTaskId = await createPlainTask(actor, householdId);

    const { statusCode, body } = await listTasks(actor, householdId, 'false');
    expect(statusCode).toBe(200);
    const result = body as TaskListResult;
    expect(result.tasks.map((t) => t.id)).toEqual([plainTaskId]);
    expect(result.tasks.every((t) => t.recurrenceRuleId === null)).toBe(true);
  });

  test('no recurring parameter returns both tasks and total matches the unfiltered count', async () => {
    const actor = await insertActor('recurring-unset-tasks@example.test');
    const householdId = await createHousehold(actor.accessToken);
    await createRecurringTask(actor, householdId);
    await createPlainTask(actor, householdId);

    const { statusCode, body } = await listTasks(actor, householdId);
    expect(statusCode).toBe(200);
    const result = body as TaskListResult;
    expect(result.tasks).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  test('a non-member requesting ?recurring=true gets 404 HOUSEHOLD_NOT_FOUND', async () => {
    const owner = await insertActor('recurring-owner-tasks@example.test');
    const householdId = await createHousehold(owner.accessToken);
    await createRecurringTask(owner, householdId);
    const outsider = await insertActor('recurring-outsider-tasks@example.test');

    const { statusCode, body } = await listTasks(outsider, householdId, 'true');
    expect(statusCode).toBe(404);
    expect((body as { error: { code: string } }).error.code).toBe('HOUSEHOLD_NOT_FOUND');
  });
});
