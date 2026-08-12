import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApplication } from '../../src/main.js';
import {
  addDays,
  currentCalendarDateIn,
  formatIsoDate,
} from '../../src/modules/recurrence/recurrence-date.js';
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
      [userId, email, email.toLowerCase(), 'lookahead actor', passwordHash],
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
    payload: { name: 'Lookahead household' },
  });
  expect(response.statusCode).toBe(201);
  return (response.json() as { id: string }).id;
}

async function createRecurringTask(
  actor: ActorFixture,
  householdId: string,
  recurrence: Record<string, unknown>,
): Promise<{ ruleId: string; taskId: string }> {
  const response = await app.getHttpAdapter().getInstance().inject({
    method: 'POST',
    url: `/api/v1/households/${householdId}/tasks`,
    headers: { authorization: `Bearer ${actor.accessToken}`, 'content-type': 'application/json' },
    payload: { title: 'Lookahead household task', recurrence },
  });
  expect(response.statusCode).toBe(201);
  const body = response.json() as { id: string; recurrenceRuleId: string | null };
  expect(body.recurrenceRuleId).not.toBeNull();
  return { ruleId: body.recurrenceRuleId!, taskId: body.id };
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
  passwordHash = await argon2.hash('lookahead-fixture-password', {
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

describe('per-rule lookahead generation window (D-11/D-12/D-13/D-18)', () => {
  test('a daily rule materializes through its own timezone\'s current calendar date, not the server UTC date', async () => {
    const actor = await insertActor('kiritimati-lookahead@example.test');
    const householdId = await createHousehold(actor.accessToken);

    // Pacific/Kiritimati (UTC+14) and Pacific/Midway (UTC-11) straddle the
    // widest possible offset from server UTC — if the generator used the
    // server's UTC date anywhere, at least one of these two would be off by
    // a day from its own zone's calendar date.
    const kiritimatiToday = currentCalendarDateIn('Pacific/Kiritimati');
    const midwayToday = currentCalendarDateIn('Pacific/Midway');

    // startsOn is a few days in the past so the post-create materialization
    // pass must actually walk forward using currentCalendarDateIn(rule.timezone)
    // to reach "today" in that zone, rather than trivially matching the seed row.
    const kiritimati = await createRecurringTask(actor, householdId, {
      freq: 'daily',
      startsOn: formatIsoDate(addDays(kiritimatiToday, -3)),
      timezone: 'Pacific/Kiritimati',
    });
    const midway = await createRecurringTask(actor, householdId, {
      freq: 'daily',
      startsOn: formatIsoDate(addDays(midwayToday, -3)),
      timezone: 'Pacific/Midway',
    });

    const kiritimatiDates = await taskOccurrenceDates(kiritimati.ruleId);
    const midwayDates = await taskOccurrenceDates(midway.ruleId);

    expect(kiritimatiDates[kiritimatiDates.length - 1]).toBe(formatIsoDate(kiritimatiToday));
    expect(midwayDates[midwayDates.length - 1]).toBe(formatIsoDate(midwayToday));
  });

  test('a weekly rule outside its 6-day lookahead window creates only the seed row', async () => {
    const actor = await insertActor('weekly-outside-window@example.test');
    const householdId = await createHousehold(actor.accessToken);
    const today = currentCalendarDateIn('UTC');
    const todayWeekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();

    const { ruleId } = await createRecurringTask(actor, householdId, {
      freq: 'weekly',
      startsOn: formatIsoDate(today),
      byWeekday: [todayWeekday],
      timezone: 'UTC',
    });

    // Next occurrence is 7 days out, past the 6-day weekly lookahead.
    const dates = await taskOccurrenceDates(ruleId);
    expect(dates).toEqual([formatIsoDate(today)]);
  });

  test('a weekly rule with an occurrence exactly 6 days out includes it — the boundary is inclusive', async () => {
    const actor = await insertActor('weekly-boundary@example.test');
    const householdId = await createHousehold(actor.accessToken);
    const today = currentCalendarDateIn('UTC');
    const todayWeekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
    const sixDaysWeekday = (todayWeekday + 6) % 7;

    const { ruleId } = await createRecurringTask(actor, householdId, {
      freq: 'weekly',
      startsOn: formatIsoDate(today),
      byWeekday: [todayWeekday, sixDaysWeekday],
      timezone: 'UTC',
    });

    const dates = await taskOccurrenceDates(ruleId);
    expect(dates).toEqual([formatIsoDate(today), formatIsoDate(addDays(today, 6))]);
  });
});
