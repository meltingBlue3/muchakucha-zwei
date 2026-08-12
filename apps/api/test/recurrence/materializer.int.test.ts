import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApplication } from '../../src/main.js';
import {
  RECURRENCE_HORIZON_DAYS,
  RECURRENCE_MAX_INSTANCES_PER_RUN,
  RecurrenceMaterializerService,
} from '../../src/modules/recurrence/recurrence-materializer.service.js';
import {
  addDays,
  daysInMonth,
  formatIsoDate,
  parseIsoDate,
  walkOccurrences,
} from '../../src/modules/recurrence/recurrence-date.js';
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
      [userId, email, email.toLowerCase(), 'materializer actor', passwordHash],
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
    payload: { name: 'Materializer household' },
  });
  expect(response.statusCode).toBe(201);
  return (response.json() as { id: string }).id;
}

async function createRecurringTask(
  actor: ActorFixture,
  householdId: string,
  recurrence: Record<string, unknown>,
): Promise<string> {
  const response = await app.getHttpAdapter().getInstance().inject({
    method: 'POST',
    url: `/api/v1/households/${householdId}/tasks`,
    headers: { authorization: `Bearer ${actor.accessToken}`, 'content-type': 'application/json' },
    payload: { title: 'Materialized household task', recurrence },
  });
  expect(response.statusCode).toBe(201);
  const body = response.json() as { recurrenceRuleId: string | null };
  expect(body.recurrenceRuleId).not.toBeNull();
  return body.recurrenceRuleId!;
}

async function taskOccurrenceDates(ruleId: string): Promise<string[]> {
  return withDatabase(async (client) => {
    const result = await client.query<{ occurrence_date: string }>(
      `SELECT occurrence_date::text FROM tasks
       WHERE recurrence_rule_id = $1
       ORDER BY occurrence_date ASC`,
      [ruleId],
    );
    return result.rows.map((row) => row.occurrence_date);
  });
}

beforeAll(async () => {
  passwordHash = await argon2.hash('materializer-fixture-password', {
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

describe('rolling recurrence materializer', () => {
  test('advances a rewound watermark without duplicating weekly occurrences', async () => {
    const actor = await insertActor('weekly-materializer@example.test');
    const householdId = await createHousehold(actor.accessToken);
    const today = parseIsoDate(new Date().toISOString().slice(0, 10));
    const todayWeekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
    const byWeekday = [1, 3, 5].map((offset) => (todayWeekday + offset) % 7).sort((a, b) => a - b);
    const ruleId = await createRecurringTask(actor, householdId, {
      freq: 'weekly',
      startsOn: formatIsoDate(today),
      byWeekday,
      timezone: 'UTC',
    });
    const horizon = addDays(today, RECURRENCE_HORIZON_DAYS);
    const expected = walkOccurrences({
      freq: 'weekly',
      interval: 1,
      byWeekday,
      startsOn: today,
    }, { horizon }).map(formatIsoDate);
    const materializer = app.get(RecurrenceMaterializerService);

    expect(await taskOccurrenceDates(ruleId)).toEqual(expected);
    expect(await materializer.materializeAllDue()).toBe(0);

    await withDatabase(async (client) => {
      await client.query(
        `UPDATE recurrence_rules
         SET materialized_through = (CURRENT_DATE - INTERVAL '30 days')::date
         WHERE id = $1`,
        [ruleId],
      );
    });
    const beforeRerun = await taskOccurrenceDates(ruleId);
    expect(await materializer.materializeAllDue()).toBe(0);
    expect(await taskOccurrenceDates(ruleId)).toEqual(beforeRerun);
    const watermark = await withDatabase(async (client) => {
      const result = await client.query<{ materialized_through: string }>(
        `SELECT materialized_through::text FROM recurrence_rules WHERE id = $1`,
        [ruleId],
      );
      return result.rows[0]!.materialized_through;
    });
    expect(watermark).toBe(formatIsoDate(horizon));
    expect(await materializer.materializeAllDue()).toBe(0);
  });

  test('caps a count-1000 daily rule at the per-run hard limit', async () => {
    const actor = await insertActor('bounded-materializer@example.test');
    const householdId = await createHousehold(actor.accessToken);
    const startsOn = new Date().toISOString().slice(0, 10);
    const ruleId = await createRecurringTask(actor, householdId, {
      freq: 'daily',
      startsOn,
      count: 1000,
      timezone: 'UTC',
    });

    const dates = await taskOccurrenceDates(ruleId);
    expect(dates.length).toBeLessThanOrEqual(RECURRENCE_MAX_INSTANCES_PER_RUN);
  });

  test('persists exactly one clamped February occurrence for a monthly 31st rule', async () => {
    const actor = await insertActor('monthly-materializer@example.test');
    const householdId = await createHousehold(actor.accessToken);
    const year = new Date().getUTCFullYear();
    const ruleId = await createRecurringTask(actor, householdId, {
      freq: 'monthly',
      startsOn: `${year}-01-31`,
      count: 12,
      timezone: 'UTC',
    });

    const februaryDates = (await taskOccurrenceDates(ruleId)).filter((date) => date.startsWith(`${year}-02-`));
    expect(februaryDates).toEqual([
      `${year}-02-${String(daysInMonth(year, 2)).padStart(2, '0')}`,
    ]);
  });
});
