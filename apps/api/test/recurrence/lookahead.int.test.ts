import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApplication } from '../../src/main.js';
import { RecurrenceMaterializerService } from '../../src/modules/recurrence/recurrence-materializer.service.js';
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

async function watermarkOf(ruleId: string): Promise<string | null> {
  return withDatabase(async (client) => {
    const result = await client.query<{ materialized_through: string | null }>(
      `SELECT materialized_through::text FROM recurrence_rules WHERE id = $1`,
      [ruleId],
    );
    return result.rows[0]!.materialized_through;
  });
}

async function listTasks(actor: ActorFixture, householdId: string): Promise<{ materializedThrough: string | null }> {
  const response = await app.getHttpAdapter().getInstance().inject({
    method: 'GET',
    url: `/api/v1/households/${householdId}/tasks`,
    headers: { authorization: `Bearer ${actor.accessToken}` },
  });
  expect(response.statusCode).toBe(200);
  return response.json() as { materializedThrough: string | null };
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

  test('a watermark ahead of the new horizon never regresses (D-13)', async () => {
    const actor = await insertActor('watermark-monotonic@example.test');
    const householdId = await createHousehold(actor.accessToken);
    const today = currentCalendarDateIn('UTC');
    const { ruleId } = await createRecurringTask(actor, householdId, {
      freq: 'daily',
      startsOn: formatIsoDate(today),
      timezone: 'UTC',
    });

    // Simulate a rule that was materialized under the old 90-day window.
    const aheadWatermark = formatIsoDate(addDays(today, 90));
    await withDatabase((client) => client.query(
      `UPDATE recurrence_rules SET materialized_through = $2::date WHERE id = $1`,
      [ruleId, aheadWatermark],
    ));
    const rowsBefore = await taskOccurrenceDates(ruleId);

    const materializer = app.get(RecurrenceMaterializerService);
    expect((await materializer.materializeRule(ruleId)).created).toBe(0);

    expect(await watermarkOf(ruleId)).toBe(aheadWatermark);
    expect(await taskOccurrenceDates(ruleId)).toEqual(rowsBefore);
  });

  test('a rule whose endsOn has passed is never selected by materializeAllDue (IN-04)', async () => {
    const actor = await insertActor('ended-rule-excluded@example.test');
    const householdId = await createHousehold(actor.accessToken);
    const today = currentCalendarDateIn('UTC');
    const { ruleId } = await createRecurringTask(actor, householdId, {
      freq: 'daily',
      startsOn: formatIsoDate(addDays(today, -10)),
      timezone: 'UTC',
    });

    // Force the rule into an "already ended, never materialized" state — the
    // state a rule reaches after D-13's monotonic guard freezes it.
    await withDatabase((client) => client.query(
      `UPDATE recurrence_rules SET ends_on = $2::date, materialized_through = NULL WHERE id = $1`,
      [ruleId, formatIsoDate(addDays(today, -1))],
    ));

    const materializer = app.get(RecurrenceMaterializerService);
    expect(await materializer.materializeAllDue()).toBe(0);
    expect(await watermarkOf(ruleId)).toBeNull();
  });

  test('the household watermark only reflects rules that can still advance', async () => {
    const actor = await insertActor('household-watermark-active-only@example.test');
    const householdId = await createHousehold(actor.accessToken);
    const today = currentCalendarDateIn('UTC');

    const active = await createRecurringTask(actor, householdId, {
      freq: 'daily',
      startsOn: formatIsoDate(today),
      timezone: 'UTC',
    });
    const ended = await createRecurringTask(actor, householdId, {
      freq: 'daily',
      startsOn: formatIsoDate(addDays(today, -30)),
      timezone: 'UTC',
    });
    // Freeze the second rule's watermark far in the past, as a rule whose
    // endsOn already passed would be under D-13's monotonic guard.
    const staleWatermark = formatIsoDate(addDays(today, -20));
    await withDatabase((client) => client.query(
      `UPDATE recurrence_rules SET ends_on = $2::date, materialized_through = $2::date WHERE id = $1`,
      [ended.ruleId, staleWatermark],
    ));

    const activeWatermark = await watermarkOf(active.ruleId);
    expect(activeWatermark).not.toBeNull();
    expect(activeWatermark).not.toBe(staleWatermark);

    const listed = await listTasks(actor, householdId);
    expect(listed.materializedThrough).toBe(activeWatermark);
  });

  test('a daily rule starting today materializes exactly 1 row, dated today — creation is a standard generation check (D-12)', async () => {
    const actor = await insertActor('create-daily-today@example.test');
    const householdId = await createHousehold(actor.accessToken);
    const today = currentCalendarDateIn('UTC');

    const { ruleId } = await createRecurringTask(actor, householdId, {
      freq: 'daily',
      startsOn: formatIsoDate(today),
      timezone: 'UTC',
    });

    const dates = await taskOccurrenceDates(ruleId);
    expect(dates).toEqual([formatIsoDate(today)]);
  });

  test('a weekly rule created outside its lookahead window keeps only the D-17 seed row, with the watermark trailing behind it', async () => {
    const actor = await insertActor('create-weekly-outside@example.test');
    const householdId = await createHousehold(actor.accessToken);
    const today = currentCalendarDateIn('UTC');
    const startsOn = addDays(today, 10);
    const startsOnWeekday = new Date(Date.UTC(startsOn.year, startsOn.month - 1, startsOn.day)).getUTCDay();

    const { ruleId } = await createRecurringTask(actor, householdId, {
      freq: 'weekly',
      startsOn: formatIsoDate(startsOn),
      byWeekday: [startsOnWeekday],
      timezone: 'UTC',
    });

    // Only the D-17 seed row exists — the next generation-eligible occurrence
    // (7 days after startsOn) is outside the 6-day weekly lookahead measured
    // from today, not from startsOn.
    const dates = await taskOccurrenceDates(ruleId);
    expect(dates).toEqual([formatIsoDate(startsOn)]);
    // The watermark reflects the lookahead horizon actually checked (today+6),
    // which trails behind the seed row's future date — that gap is expected,
    // since the seed row is not produced by the lookahead walk at all.
    expect(await watermarkOf(ruleId)).toBe(formatIsoDate(addDays(today, 6)));
  });

  test('the create response contract still exposes a usable task id and recurrence id (D-17)', async () => {
    const actor = await insertActor('create-response-contract@example.test');
    const householdId = await createHousehold(actor.accessToken);
    const today = currentCalendarDateIn('UTC');
    const startsOn = addDays(today, 10);
    const startsOnWeekday = new Date(Date.UTC(startsOn.year, startsOn.month - 1, startsOn.day)).getUTCDay();

    const response = await app.getHttpAdapter().getInstance().inject({
      method: 'POST',
      url: `/api/v1/households/${householdId}/tasks`,
      headers: { authorization: `Bearer ${actor.accessToken}`, 'content-type': 'application/json' },
      payload: {
        title: 'Response contract task',
        recurrence: {
          freq: 'weekly',
          startsOn: formatIsoDate(startsOn),
          byWeekday: [startsOnWeekday],
          timezone: 'UTC',
        },
      },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as { id: string; recurrence: { id: string } | null };
    // The seed row's id is what the client immediately uses for tagTask —
    // this must remain populated regardless of how far the lookahead window
    // trails behind the seed row's occurrence date.
    expect(typeof body.id).toBe('string');
    expect(body.id.length).toBeGreaterThan(0);
    expect(typeof body.recurrence?.id).toBe('string');
    expect(body.recurrence!.id.length).toBeGreaterThan(0);
  });
});
