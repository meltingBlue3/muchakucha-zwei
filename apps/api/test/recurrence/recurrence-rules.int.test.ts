import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApplication } from '../../src/main.js';
import { RecurrenceMaterializerService } from '../../src/modules/recurrence/recurrence-materializer.service.js';
import { getTestDatabaseUrl, resetDatabase } from '../reset-database.js';

const accessSecret = 'test-only-access-secret-that-is-longer-than-thirty-two-bytes';
const jwt = new JwtService({ secret: accessSecret, signOptions: { algorithm: 'HS256', expiresIn: 15 * 60 } });
let app: NestFastifyApplication;
let passwordHash: string;

interface ActorFixture { accessToken: string; userId: string }

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
      [userId, email, email.toLowerCase(), 'recurrence actor', passwordHash],
    );
    await client.query(
      `INSERT INTO "AuthSession" ("id", "user_id", "absolute_ends_at") VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '30 days')`,
      [sessionId, userId],
    );
  });
  return { userId, accessToken: await jwt.signAsync({ sub: userId, sid: sessionId }) };
}

async function createHousehold(accessToken: string): Promise<string> {
  const response = await app.getHttpAdapter().getInstance().inject({
    method: 'POST', url: '/api/v1/households',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    payload: { name: 'Recurrence household' },
  });
  expect(response.statusCode).toBe(201);
  return (response.json() as { id: string }).id;
}

async function addMemberViaDb(householdId: string, actor: ActorFixture, role: string = 'MEMBER'): Promise<void> {
  await withDatabase(async (client) => {
    await client.query(
      `INSERT INTO "memberships" ("user_id", "household_id", "role") VALUES ($1, $2, $3)`,
      [actor.userId, householdId, role],
    );
  });
}

async function taskApi(
  accessToken: string,
  householdId: string,
  method: 'GET' | 'POST',
  payload?: unknown,
): Promise<{ statusCode: number; json: () => any }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (app.getHttpAdapter().getInstance() as any).inject({
    method,
    url: `/api/v1/households/${householdId}/tasks`,
    headers: { authorization: `Bearer ${accessToken}`, ...(payload === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(payload === undefined ? {} : { payload }),
  });
  return response as { statusCode: number; json: () => any };
}

async function eventApi(
  accessToken: string,
  householdId: string,
  method: 'GET' | 'POST' | 'PUT',
  path: string = '',
  payload?: unknown,
): Promise<{ statusCode: number; json: () => any }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (app.getHttpAdapter().getInstance() as any).inject({
    method,
    url: `/api/v1/households/${encodeURIComponent(householdId)}/events${path}`,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(payload === undefined ? {} : { payload }),
  });
  return response as { statusCode: number; json: () => any };
}

beforeAll(async () => {
  passwordHash = await argon2.hash('recurrence-fixture-password', { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  app = await createApplication({ ...process.env, NODE_ENV: 'test', JWT_ACCESS_SECRET: accessSecret, DATABASE_URL: getTestDatabaseUrl() });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => { await app?.close(); });
beforeEach(async () => { await resetDatabase(); });

describe('daily task recurrence tracer', () => {
  test('creates a recurrence rule and five real task occurrences', async () => {
    const owner = await insertActor('recurrence-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const startsOn = new Date().toISOString().slice(0, 10);
    const response = await taskApi(owner.accessToken, householdId, 'POST', {
      title: 'Daily household task',
      priority: 'high',
      recurrence: { freq: 'daily', startsOn, count: 5, timezone: 'Asia/Shanghai', startTimeLocal: '08:30' },
    });
    expect(response.statusCode).toBe(201);
    const created = response.json() as { recurrenceRuleId: string | null; occurrenceDate: string; recurrence: { materializedThrough: string } };
    expect(created.recurrenceRuleId).not.toBeNull();
    expect(created.occurrenceDate).toBe(startsOn);
    expect(created.recurrence.materializedThrough).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const listed = await taskApi(owner.accessToken, householdId, 'GET');
    expect(listed.statusCode).toBe(200);
    const body = listed.json() as { total: number; materializedThrough: string; tasks: Array<{ recurrenceRuleId: string; occurrenceDate: string }> };
    expect(body.total).toBe(5);
    expect(body.tasks).toHaveLength(5);
    expect(body.tasks.every((task) => task.recurrenceRuleId === created.recurrenceRuleId)).toBe(true);
    expect(body.materializedThrough).toBe(created.recurrence.materializedThrough);

    const materializer = app.get(RecurrenceMaterializerService);
    expect(await materializer.materializeRule(created.recurrenceRuleId!)).toBe(0);
    const rerun = await taskApi(owner.accessToken, householdId, 'GET');
    expect((rerun.json() as { total: number }).total).toBe(5);
  });

  test('keeps ordinary tasks on the existing path', async () => {
    const owner = await insertActor('ordinary-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const response = await taskApi(owner.accessToken, householdId, 'POST', { title: 'One time task' });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ recurrenceRuleId: null, occurrenceDate: null, recurrence: null });
  });

  test('rejects mutually exclusive endsOn and count at the API and database boundaries', async () => {
    const owner = await insertActor('invalid-recurrence@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const startsOn = new Date().toISOString().slice(0, 10);
    const response = await taskApi(owner.accessToken, householdId, 'POST', {
      title: 'Invalid recurrence',
      recurrence: { freq: 'daily', startsOn, endsOn: startsOn, count: 2, timezone: 'UTC' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_FAILED');
    await expect(withDatabase((client) => client.query(
      `INSERT INTO "recurrence_rules" ("household_id", "freq", "starts_on", "ends_on", "count", "timezone", "created_by") VALUES ($1, 'daily', $2, $2, 2, 'UTC', $3)`,
      [householdId, startsOn, owner.userId],
    ))).rejects.toThrow();
  });

  test('does not disclose household existence to a non-member', async () => {
    const owner = await insertActor('member-recurrence@example.test');
    const outsider = await insertActor('outsider-recurrence@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const response = await taskApi(outsider.accessToken, householdId, 'POST', {
      title: 'Forbidden recurrence',
      recurrence: { freq: 'daily', startsOn: new Date().toISOString().slice(0, 10), count: 2, timezone: 'UTC' },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('HOUSEHOLD_NOT_FOUND');
  });
});

describe('recurring events', () => {
  const startsOn = '2026-08-18'; // Tuesday
  const recurringEvent = {
    title: 'Tuesday and Thursday family event',
    startTime: '2026-08-18T01:00:00.000Z',
    endTime: '2026-08-18T02:30:00.000Z',
    recurrence: {
      freq: 'weekly',
      byWeekday: [2, 4],
      startsOn,
      count: 6,
      timezone: 'Asia/Shanghai',
    },
  };

  test('materializes six wall-clock occurrences, filters cancellation from lists, and preserves deep links', async () => {
    const owner = await insertActor('recurring-event-owner@example.test');
    const member = await insertActor('recurring-event-member@example.test');
    const householdId = await createHousehold(owner.accessToken);
    await addMemberViaDb(householdId, member);

    const response = await eventApi(owner.accessToken, householdId, 'POST', '', recurringEvent);
    expect(response.statusCode).toBe(201);
    const created = response.json() as {
      recurrenceRuleId: string | null;
      recurrence: { freq: string; materializedThrough: string };
    };
    expect(created.recurrenceRuleId).not.toBeNull();
    expect(created.recurrence.freq).toBe('weekly');

    const listed = await eventApi(
      owner.accessToken,
      householdId,
      'GET',
      '?startDate=2026-08-18&endDate=2026-09-10',
    );
    expect(listed.statusCode).toBe(200);
    const listBody = listed.json() as {
      total: number;
      materializedThrough: string;
      events: Array<{ id: string; startTime: string; endTime: string; occurrenceDate: string }>;
    };
    expect(listBody.total).toBe(6);
    expect(listBody.events).toHaveLength(6);
    expect(listBody.materializedThrough).toBe(created.recurrence.materializedThrough);
    expect(new Set(listBody.events.map((event) => event.occurrenceDate)).size).toBe(6);
    expect(listBody.events.every((event) => [2, 4].includes(new Date(`${event.occurrenceDate}T00:00:00.000Z`).getUTCDay()))).toBe(true);
    expect(listBody.events.every((event) => (
      new Date(event.endTime).getTime() - new Date(event.startTime).getTime() === 90 * 60_000
    ))).toBe(true);

    const cancelledId = listBody.events[2]!.id;
    await withDatabase((client) => client.query(
      `UPDATE "events" SET "cancelled_at" = CURRENT_TIMESTAMP WHERE "id" = $1`,
      [cancelledId],
    ));
    const afterCancellation = await eventApi(
      owner.accessToken,
      householdId,
      'GET',
      '?startDate=2026-08-18&endDate=2026-09-10',
    );
    const afterBody = afterCancellation.json() as { total: number; events: Array<{ id: string }> };
    expect(afterBody.total).toBe(5);
    expect(afterBody.events.some((event) => event.id === cancelledId)).toBe(false);

    const deepLink = await eventApi(owner.accessToken, householdId, 'GET', `/${cancelledId}`);
    expect(deepLink.statusCode).toBe(200);
    expect((deepLink.json() as { cancelledAt: string | null }).cancelledAt).not.toBeNull();

    const forbidden = await eventApi(member.accessToken, householdId, 'PUT', `/${listBody.events[0]!.id}`, {
      title: 'Unauthorized recurring event edit',
    });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().error.code).toBe('FORBIDDEN');
  });

  test('returns a null household watermark when no recurrence rule exists', async () => {
    const owner = await insertActor('event-watermark-empty@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const response = await eventApi(owner.accessToken, householdId, 'GET');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ events: [], total: 0, materializedThrough: null });
  });

  test('rejects invalid recurrence bounds and timezones with stable validation errors', async () => {
    const owner = await insertActor('invalid-event-recurrence@example.test');
    const householdId = await createHousehold(owner.accessToken);

    const mutuallyExclusive = await eventApi(owner.accessToken, householdId, 'POST', '', {
      ...recurringEvent,
      recurrence: { ...recurringEvent.recurrence, endsOn: '2026-09-10' },
    });
    expect(mutuallyExclusive.statusCode).toBe(400);
    expect(mutuallyExclusive.json().error.code).toBe('VALIDATION_FAILED');
    expect(mutuallyExclusive.json().error.details[0].field).toBe('recurrence.endsOn');

    const invalidTimezone = await eventApi(owner.accessToken, householdId, 'POST', '', {
      ...recurringEvent,
      recurrence: { ...recurringEvent.recurrence, timezone: 'Not/AZone' },
    });
    expect(invalidTimezone.statusCode).toBe(400);
    expect(invalidTimezone.json().error.code).toBe('VALIDATION_FAILED');

    const excessiveCount = await eventApi(owner.accessToken, householdId, 'POST', '', {
      ...recurringEvent,
      recurrence: { ...recurringEvent.recurrence, count: 5000 },
    });
    expect(excessiveCount.statusCode).toBe(400);
    expect(excessiveCount.json().error.code).toBe('VALIDATION_FAILED');
  });

  test('does not disclose a household to a non-member creating recurrence', async () => {
    const owner = await insertActor('event-household-owner@example.test');
    const outsider = await insertActor('event-household-outsider@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const response = await eventApi(outsider.accessToken, householdId, 'POST', '', recurringEvent);
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('HOUSEHOLD_NOT_FOUND');
  });
});
