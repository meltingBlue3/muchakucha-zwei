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

async function taskItemApi(
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
      ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(payload === undefined ? {} : { payload }),
  });
  return response as { statusCode: number; json: () => any };
}

async function eventApi(
  accessToken: string,
  householdId: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
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
      `INSERT INTO "recurrence_rules" ("household_id", "freq", "starts_on", "ends_on", "count", "timezone", "template_title", "created_by") VALUES ($1, 'daily', $2, $2, 2, 'UTC', 'Invalid recurrence', $3)`,
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

describe('series template isolation', () => {
  test('generates later occurrences from the rule template, never from an edited earlier instance', async () => {
    const owner = await insertActor('template-isolation-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const startsOn = new Date().toISOString().slice(0, 10);
    const created = await taskApi(owner.accessToken, householdId, 'POST', {
      title: 'Daily original',
      recurrence: { freq: 'daily', startsOn, timezone: 'UTC', startTimeLocal: '08:00' },
    });
    expect(created.statusCode).toBe(201);
    const { recurrenceRuleId, id: firstTaskId } = created.json() as { recurrenceRuleId: string; id: string };

    // The earliest surviving instance is exactly the row the materializer used
    // to treat as a mutable template. Edit it the way D-07 allows ("仅此一次")
    // and complete it the way D-04 expects.
    const edited = await taskItemApi(owner.accessToken, householdId, 'PUT', `/${firstTaskId}`, {
      title: 'Edited once',
      status: 'completed',
      priority: 'urgent',
    });
    expect(edited.statusCode).toBe(200);

    // Simulate the rolling horizon advancing: drop the tail of the series and
    // rewind the watermark so the next run genuinely has rows to generate.
    const cutoff = await withDatabase(async (client) => {
      const boundary = await client.query<{ occurrence_date: string }>(
        `SELECT "occurrence_date"::text AS "occurrence_date" FROM "tasks"
         WHERE "recurrence_rule_id" = $1 ORDER BY "occurrence_date" ASC OFFSET 10 LIMIT 1`,
        [recurrenceRuleId],
      );
      const cut = boundary.rows[0]!.occurrence_date;
      await client.query(
        `DELETE FROM "tasks" WHERE "recurrence_rule_id" = $1 AND "occurrence_date" > $2::date`,
        [recurrenceRuleId, cut],
      );
      await client.query(
        `UPDATE "recurrence_rules" SET "materialized_through" = $2::date WHERE "id" = $1`,
        [recurrenceRuleId, cut],
      );
      return cut;
    });

    const materializer = app.get(RecurrenceMaterializerService);
    expect(await materializer.materializeRule(recurrenceRuleId)).toBeGreaterThan(0);

    const state = await withDatabase(async (client) => {
      const regenerated = await client.query<{ title: string; status: string; priority: string }>(
        `SELECT "title", "status", "priority" FROM "tasks"
         WHERE "recurrence_rule_id" = $1 AND "occurrence_date" > $2::date`,
        [recurrenceRuleId, cutoff],
      );
      const first = await client.query<{ title: string; status: string; priority: string }>(
        `SELECT "title", "status", "priority" FROM "tasks" WHERE "id" = $1`,
        [firstTaskId],
      );
      return { regenerated: regenerated.rows, first: first.rows[0]! };
    });

    expect(state.regenerated.length).toBeGreaterThan(0);
    expect(state.regenerated.every((row) => row.title === 'Daily original')).toBe(true);
    expect(state.regenerated.every((row) => row.status === 'pending')).toBe(true);
    expect(state.regenerated.every((row) => row.priority === 'medium')).toBe(true);
    // The single-occurrence edit itself must survive untouched.
    expect(state.first).toMatchObject({ title: 'Edited once', status: 'completed', priority: 'urgent' });
  });
});

describe('deleting a single occurrence', () => {
  test('cancels a recurring task instead of hard-deleting it, so no run resurrects it', async () => {
    const owner = await insertActor('occurrence-delete-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const startsOn = new Date().toISOString().slice(0, 10);
    const created = await taskApi(owner.accessToken, householdId, 'POST', {
      title: 'Deletable daily task',
      recurrence: { freq: 'daily', startsOn, timezone: 'UTC', startTimeLocal: '08:00' },
    });
    expect(created.statusCode).toBe(201);
    const recurrenceRuleId = (created.json() as { recurrenceRuleId: string }).recurrenceRuleId;
    const ordered = ((await taskApi(owner.accessToken, householdId, 'GET')).json() as {
      tasks: Array<{ id: string; occurrenceDate: string }>;
    }).tasks.sort((left, right) => left.occurrenceDate.localeCompare(right.occurrenceDate));
    const target = ordered[3]!;

    const deleted = await taskItemApi(owner.accessToken, householdId, 'DELETE', `/${target.id}`);
    expect(deleted.statusCode).toBe(204);

    // Rewind the watermark so the walk genuinely re-enumerates the removed
    // occurrence's date — the exact tick that used to bring it back.
    await withDatabase((client) => client.query(
      `UPDATE "recurrence_rules" SET "materialized_through" = $2::date - 1 WHERE "id" = $1`,
      [recurrenceRuleId, target.occurrenceDate],
    ));
    const materializer = app.get(RecurrenceMaterializerService);
    await materializer.materializeRule(recurrenceRuleId);

    const rows = await withDatabase(async (client) => (await client.query<{ id: string; status: string }>(
      `SELECT "id", "status" FROM "tasks" WHERE "recurrence_rule_id" = $1 AND "occurrence_date" = $2::date`,
      [recurrenceRuleId, target.occurrenceDate],
    )).rows);
    expect(rows).toEqual([{ id: target.id, status: 'cancelled' }]);
  });

  test('cancels a recurring event instead of hard-deleting it, so no run resurrects it', async () => {
    const owner = await insertActor('occurrence-delete-event-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const response = await eventApi(owner.accessToken, householdId, 'POST', '', {
      title: 'Deletable weekly event',
      startTime: '2026-08-18T01:00:00.000Z',
      endTime: '2026-08-18T02:30:00.000Z',
      recurrence: {
        freq: 'weekly', byWeekday: [2, 4], startsOn: '2026-08-18', count: 6, timezone: 'Asia/Shanghai',
      },
    });
    expect(response.statusCode).toBe(201);
    const recurrenceRuleId = (response.json() as { recurrenceRuleId: string }).recurrenceRuleId;
    const events = ((await eventApi(owner.accessToken, householdId, 'GET')).json() as {
      events: Array<{ id: string; occurrenceDate: string }>;
    }).events.sort((left, right) => left.occurrenceDate.localeCompare(right.occurrenceDate));
    const target = events[2]!;

    const deleted = await eventApi(owner.accessToken, householdId, 'DELETE', `/${target.id}`);
    expect(deleted.statusCode).toBe(204);

    await withDatabase((client) => client.query(
      `UPDATE "recurrence_rules" SET "materialized_through" = $2::date - 1 WHERE "id" = $1`,
      [recurrenceRuleId, target.occurrenceDate],
    ));
    const materializer = app.get(RecurrenceMaterializerService);
    await materializer.materializeRule(recurrenceRuleId);

    const rows = await withDatabase(async (client) => (await client.query<{ id: string; cancelled: boolean }>(
      `SELECT "id", ("cancelled_at" IS NOT NULL) AS "cancelled" FROM "events"
       WHERE "recurrence_rule_id" = $1 AND "occurrence_date" = $2::date`,
      [recurrenceRuleId, target.occurrenceDate],
    )).rows);
    expect(rows).toEqual([{ id: target.id, cancelled: true }]);
  });
});

describe('per-instance association edits', () => {
  test('does not re-apply the template assignees to instances a later run did not create', async () => {
    const owner = await insertActor('assignee-fanout-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const startsOn = new Date().toISOString().slice(0, 10);
    const created = await taskApi(owner.accessToken, householdId, 'POST', {
      title: 'Weekly chore',
      assigneeIds: [owner.userId],
      recurrence: { freq: 'daily', startsOn, timezone: 'UTC', startTimeLocal: '08:00' },
    });
    expect(created.statusCode).toBe(201);
    const recurrenceRuleId = (created.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    const listed = (await taskApi(owner.accessToken, householdId, 'GET')).json() as {
      tasks: Array<{ id: string; occurrenceDate: string; assigneeIds: string[] }>;
    };
    const ordered = listed.tasks.sort((left, right) => left.occurrenceDate.localeCompare(right.occurrenceDate));
    const unassigned = ordered[2]!;
    expect(unassigned.assigneeIds).toEqual([owner.userId]);

    const removal = await taskItemApi(owner.accessToken, householdId, 'PUT', `/${unassigned.id}`, {
      assigneeIds: [],
    });
    expect(removal.statusCode).toBe(200);
    expect((removal.json() as { assigneeIds: string[] }).assigneeIds).toEqual([]);

    // Force a run that genuinely creates rows, the way the scheduler does once
    // the horizon advances.
    await withDatabase(async (client) => {
      const boundary = await client.query<{ occurrence_date: string }>(
        `SELECT "occurrence_date"::text AS "occurrence_date" FROM "tasks"
         WHERE "recurrence_rule_id" = $1 ORDER BY "occurrence_date" ASC OFFSET 10 LIMIT 1`,
        [recurrenceRuleId],
      );
      const cut = boundary.rows[0]!.occurrence_date;
      await client.query(
        `DELETE FROM "tasks" WHERE "recurrence_rule_id" = $1 AND "occurrence_date" > $2::date`,
        [recurrenceRuleId, cut],
      );
      await client.query(
        `UPDATE "recurrence_rules" SET "materialized_through" = $2::date WHERE "id" = $1`,
        [recurrenceRuleId, cut],
      );
    });
    const materializer = app.get(RecurrenceMaterializerService);
    expect(await materializer.materializeRule(recurrenceRuleId)).toBeGreaterThan(0);

    const after = await withDatabase(async (client) => (await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS "count" FROM "task_assignees" WHERE "task_id" = $1`,
      [unassigned.id],
    )).rows[0]!.count);
    expect(after).toBe('0');
  });
});

describe('series scope operations', () => {
  async function createDailySeries(
    owner: ActorFixture,
    householdId: string,
    title: string,
  ): Promise<{ recurrenceRuleId: string; tasks: Array<{ id: string; occurrenceDate: string; title: string; status: string }> }> {
    const created = await taskApi(owner.accessToken, householdId, 'POST', {
      title,
      recurrence: {
        freq: 'daily',
        startsOn: '2026-08-20',
        count: 7,
        timezone: 'UTC',
        startTimeLocal: '08:00',
      },
    });
    expect(created.statusCode).toBe(201);
    const recurrenceRuleId = (created.json() as { recurrenceRuleId: string }).recurrenceRuleId;
    const listed = await taskApi(owner.accessToken, householdId, 'GET');
    const tasks = (listed.json() as { tasks: Array<{ id: string; occurrenceDate: string; title: string; status: string }> }).tasks
      .sort((left, right) => left.occurrenceDate.localeCompare(right.occurrenceDate));
    return { recurrenceRuleId, tasks };
  }

  test('keeps this_only edits isolated and never regenerates a cancelled occurrence', async () => {
    const owner = await insertActor('scope-once-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const series = await createDailySeries(owner, householdId, 'Daily original');
    const edited = series.tasks[1]!;
    const cancelled = series.tasks[2]!;

    const editResponse = await taskItemApi(owner.accessToken, householdId, 'PUT', `/${edited.id}`, {
      title: 'Edited once',
    });
    expect(editResponse.statusCode).toBe(200);
    const directCancel = await taskItemApi(owner.accessToken, householdId, 'PUT', `/${series.tasks[0]!.id}`, {
      status: 'cancelled',
    });
    expect(directCancel.statusCode).toBe(200);

    const cancelResponse = await taskItemApi(
      owner.accessToken,
      householdId,
      'DELETE',
      `/${cancelled.id}/series?scope=this_only`,
    );
    expect(cancelResponse.statusCode).toBe(204);
    const materializer = app.get(RecurrenceMaterializerService);
    expect(await materializer.materializeRule(series.recurrenceRuleId)).toBe(0);

    const after = (await taskApi(owner.accessToken, householdId, 'GET')).json() as {
      tasks: Array<{ id: string; occurrenceDate: string; title: string; status: string }>;
    };
    expect(after.tasks.find((task) => task.id === edited.id)?.title).toBe('Edited once');
    expect(after.tasks.filter((task) => task.id !== edited.id).every((task) => task.title === 'Daily original')).toBe(true);
    expect(after.tasks.filter((task) => task.occurrenceDate === cancelled.occurrenceDate)).toEqual([
      expect.objectContaining({ id: cancelled.id, status: 'cancelled' }),
    ]);
  });

  test('atomically splits this_and_following while preserving historical rows', async () => {
    const owner = await insertActor('scope-split-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const series = await createDailySeries(owner, householdId, 'Old series');
    const split = series.tasks[3]!;
    const historicalBefore = await withDatabase(async (client) => (
      await client.query(
        `SELECT "id", "title", "status", "updated_at" FROM "tasks"
         WHERE "recurrence_rule_id" = $1 AND "occurrence_date" < $2::date ORDER BY "occurrence_date"`,
        [series.recurrenceRuleId, split.occurrenceDate],
      )
    ).rows);

    const response = await taskItemApi(owner.accessToken, householdId, 'PUT', `/${split.id}/series`, {
      title: 'New weekday series',
      recurrence: {
        freq: 'weekly',
        byWeekday: [1, 3, 5],
        startsOn: split.occurrenceDate,
        count: 4,
        timezone: 'UTC',
        startTimeLocal: '08:00',
      },
    });
    expect(response.statusCode).toBe(200);
    const newRuleId = (response.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    const state = await withDatabase(async (client) => {
      const oldRule = await client.query(`SELECT "ends_on"::text AS "ends_on" FROM "recurrence_rules" WHERE "id" = $1`, [series.recurrenceRuleId]);
      const newRule = await client.query(`SELECT "starts_on"::text AS "starts_on", "by_weekday" FROM "recurrence_rules" WHERE "id" = $1`, [newRuleId]);
      const oldFuture = await client.query(
        `SELECT "id" FROM "tasks" WHERE "recurrence_rule_id" = $1 AND "occurrence_date" >= $2::date`,
        [series.recurrenceRuleId, split.occurrenceDate],
      );
      const newTasks = await client.query(
        `SELECT "id", "title" FROM "tasks" WHERE "recurrence_rule_id" = $1 ORDER BY "occurrence_date"`,
        [newRuleId],
      );
      const historicalAfter = await client.query(
        `SELECT "id", "title", "status", "updated_at" FROM "tasks"
         WHERE "recurrence_rule_id" = $1 AND "occurrence_date" < $2::date ORDER BY "occurrence_date"`,
        [series.recurrenceRuleId, split.occurrenceDate],
      );
      return { oldRule: oldRule.rows[0], newRule: newRule.rows[0], oldFuture: oldFuture.rows, newTasks: newTasks.rows, historicalAfter: historicalAfter.rows };
    });
    const expectedEnd = new Date(`${split.occurrenceDate}T00:00:00.000Z`);
    expectedEnd.setUTCDate(expectedEnd.getUTCDate() - 1);
    expect(state.oldRule.ends_on).toBe(expectedEnd.toISOString().slice(0, 10));
    expect(state.newRule.starts_on).toBe(split.occurrenceDate);
    expect(state.newRule.by_weekday).toEqual([1, 3, 5]);
    expect(state.oldFuture).toHaveLength(0);
    expect(state.newTasks.length).toBeGreaterThan(0);
    expect(state.newTasks.every((task) => task.title === 'New weekday series')).toBe(true);
    expect(state.historicalAfter).toEqual(historicalBefore);
  });

  test('rolls back the old ends_on and future rows when successor creation fails', async () => {
    const owner = await insertActor('scope-rollback-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const series = await createDailySeries(owner, householdId, 'Rollback series');
    const split = series.tasks[3]!;
    const before = await withDatabase(async (client) => {
      const rule = await client.query(`SELECT "ends_on" FROM "recurrence_rules" WHERE "id" = $1`, [series.recurrenceRuleId]);
      const future = await client.query(
        `SELECT "id" FROM "tasks" WHERE "recurrence_rule_id" = $1 AND "occurrence_date" >= $2::date ORDER BY "id"`,
        [series.recurrenceRuleId, split.occurrenceDate],
      );
      return { ends_on: rule.rows[0].ends_on, future: future.rows };
    });
    const response = await taskItemApi(owner.accessToken, householdId, 'PUT', `/${split.id}/series`, {
      recurrence: {
        freq: 'daily',
        startsOn: split.occurrenceDate,
        endsOn: '2026-09-01',
        count: 2,
        timezone: 'UTC',
      },
    });
    expect(response.statusCode).toBe(400);
    const after = await withDatabase(async (client) => {
      const rule = await client.query(`SELECT "ends_on" FROM "recurrence_rules" WHERE "id" = $1`, [series.recurrenceRuleId]);
      const future = await client.query(
        `SELECT "id" FROM "tasks" WHERE "recurrence_rule_id" = $1 AND "occurrence_date" >= $2::date ORDER BY "id"`,
        [series.recurrenceRuleId, split.occurrenceDate],
      );
      return { ends_on: rule.rows[0].ends_on, future: future.rows };
    });
    expect(after.ends_on).toEqual(before.ends_on);
    expect(after.future).toEqual(before.future);
  });

  test('applies labelIds to the successor series instead of copying the old labels', async () => {
    const owner = await insertActor('scope-labels-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const createLabel = async (name: string): Promise<string> => {
      const response = await (app.getHttpAdapter().getInstance() as any).inject({
        method: 'POST',
        url: `/api/v1/households/${householdId}/labels`,
        headers: { authorization: `Bearer ${owner.accessToken}`, 'content-type': 'application/json' },
        payload: { name, color: '#FF8A65' },
      });
      expect(response.statusCode).toBe(201);
      return (response.json() as { id: string }).id;
    };
    const keptLabelId = await createLabel('保留');
    const droppedLabelId = await createLabel('删除');

    const series = await createDailySeries(owner, householdId, 'Labelled series');
    const split = series.tasks[3]!;
    const tagged = await (app.getHttpAdapter().getInstance() as any).inject({
      method: 'POST',
      url: `/api/v1/households/${householdId}/tasks/${split.id}/labels`,
      headers: { authorization: `Bearer ${owner.accessToken}`, 'content-type': 'application/json' },
      payload: { labelIds: [keptLabelId, droppedLabelId] },
    });
    expect(tagged.statusCode).toBeLessThan(300);

    // A label from outside the household must never be attachable this way.
    // Checked first: a successful split replaces the occurrence row entirely.
    const rejected = await taskItemApi(owner.accessToken, householdId, 'PUT', `/${split.id}/series`, {
      labelIds: [randomUUID()],
    });
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json().error.details[0].field).toBe('labelIds');

    const response = await taskItemApi(owner.accessToken, householdId, 'PUT', `/${split.id}/series`, {
      title: 'Labelled series',
      labelIds: [keptLabelId],
    });
    expect(response.statusCode).toBe(200);
    const newRuleId = (response.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    const labelIds = await withDatabase(async (client) => (await client.query<{ label_id: string }>(
      `SELECT DISTINCT tl."label_id" FROM "task_labels" tl
       JOIN "tasks" t ON t."id" = tl."task_id"
       WHERE t."recurrence_rule_id" = $1`,
      [newRuleId],
    )).rows.map((row) => row.label_id));
    expect(labelIds).toEqual([keptLabelId]);
  });

  test('rejects malformed path ids with 400 rather than a driver-level 500', async () => {
    const owner = await insertActor('scope-param-validation@example.test');
    const householdId = await createHousehold(owner.accessToken);

    const badHousehold = await taskItemApi(
      owner.accessToken,
      'not-a-uuid',
      'DELETE',
      `/${randomUUID()}/series?scope=this_only`,
    );
    expect(badHousehold.statusCode).toBe(400);

    const badTask = await taskItemApi(
      owner.accessToken,
      householdId,
      'DELETE',
      '/not-a-uuid/series?scope=this_only',
    );
    expect(badTask.statusCode).toBe(400);
  });

  test('rejects /series for a one-time task', async () => {
    const owner = await insertActor('scope-ordinary-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const created = await taskApi(owner.accessToken, householdId, 'POST', { title: 'One time only' });
    const taskId = (created.json() as { id: string }).id;
    const response = await taskItemApi(owner.accessToken, householdId, 'DELETE', `/${taskId}/series?scope=this_only`);
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  test('returns 404 across households and 403 for a member editing another creator series', async () => {
    const owner = await insertActor('scope-auth-owner@example.test');
    const member = await insertActor('scope-auth-member@example.test');
    const otherOwner = await insertActor('scope-auth-other@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const otherHouseholdId = await createHousehold(otherOwner.accessToken);
    await addMemberViaDb(householdId, member);
    const series = await createDailySeries(owner, householdId, 'Protected series');

    const crossHousehold = await taskItemApi(
      otherOwner.accessToken,
      otherHouseholdId,
      'DELETE',
      `/${series.tasks[0]!.id}/series?scope=this_only`,
    );
    expect(crossHousehold.statusCode).toBe(404);
    const forbidden = await taskItemApi(
      member.accessToken,
      householdId,
      'DELETE',
      `/${series.tasks[0]!.id}/series?scope=this_and_following`,
    );
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().error.code).toBe('FORBIDDEN');
  });
});
