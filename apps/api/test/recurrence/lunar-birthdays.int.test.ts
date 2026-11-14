import { fixtureEditPayload } from '../../../../scripts/test-edit-version.js';
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { JwtService } from '@nestjs/jwt';
import { lunarAnniversary, toLunar } from '@muchakucha/lunar';
import * as argon2 from 'argon2';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApplication } from '../../src/main.js';
import { addDays, currentCalendarDateIn, formatIsoDate, parseIsoDate } from '../../src/modules/recurrence/recurrence-date.js';
import { getTestDatabaseUrl, resetDatabase } from '../reset-database.js';

const accessSecret = 'test-only-access-secret-that-is-longer-than-thirty-two-bytes';
const jwt = new JwtService({ secret: accessSecret, signOptions: { algorithm: 'HS256', expiresIn: 15 * 60 } });
const TIME_ZONE = 'Asia/Shanghai';
let app: NestFastifyApplication;
let passwordHash: string;

type InjectResponse = { statusCode: number; json: () => any };

async function withDatabase<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: getTestDatabaseUrl() });
  await client.connect();
  try { return await run(client); } finally { await client.end(); }
}

async function insertActor(username: string): Promise<string> {
  const userId = randomUUID();
  const sessionId = randomUUID();
  await withDatabase(async (client) => {
    await client.query(
      `INSERT INTO "User" ("id", "username", "username_canonical", "display_name", "password_hash")
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, username, username.toLowerCase(), 'lunar birthday actor', passwordHash],
    );
    await client.query(
      `INSERT INTO "AuthSession" ("id", "user_id", "absolute_ends_at")
       VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '30 days')`,
      [sessionId, userId],
    );
  });
  return jwt.signAsync({ sub: userId, sid: sessionId });
}

async function request(token: string, method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown): Promise<InjectResponse> {
  const body = await fixtureEditPayload(method, url, payload, async (readUrl) => {
    const snapshot = await app.getHttpAdapter().getInstance().inject({ method: 'GET', url: readUrl, headers: { authorization: `Bearer ${token}` } });
    return snapshot.json();
  });
  return (app.getHttpAdapter().getInstance() as any).inject({
    method,
    url,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { payload: body }),
  }) as Promise<InjectResponse>;
}

async function createHousehold(token: string): Promise<string> {
  const response = await request(token, 'POST', '/api/v1/households', { name: 'Lunar birthday household' });
  expect(response.statusCode).toBe(201);
  return (response.json() as { id: string }).id;
}

const today = formatIsoDate(currentCalendarDateIn(TIME_ZONE));

/** The first lunar month and day on or after an ISO date. */
function lunarDateFrom(from: string, month: number, day: number): string {
  const year = Number(from.slice(0, 4));
  return [year - 1, year, year + 1]
    .map(lunarYear => formatIsoDate(lunarAnniversary(lunarYear, month, day)!))
    .find(date => date >= from)!;
}

/** An all-day birthday series on lunar 十月十五, created today. */
function lunarBirthday(extra: Record<string, unknown> = {}) {
  const start = new Date(`${today}T00:00:00+08:00`);
  return {
    title: '妈妈的农历生日',
    allDay: true,
    startTime: start.toISOString(),
    endTime: new Date(start.getTime() + 86_400_000).toISOString(),
    recurrence: {
      freq: 'yearly', startsOn: today, timezone: TIME_ZONE,
      lunar: { month: 10, day: 15 }, occasion: 'birthday', birthYear: 1968, ...extra,
    },
  };
}

beforeAll(async () => {
  passwordHash = await argon2.hash('lunar-birthday-fixture-password', { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  app = await createApplication({ ...process.env, NODE_ENV: 'test', JWT_ACCESS_SECRET: accessSecret, DATABASE_URL: getTestDatabaseUrl() });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => { await app?.close(); });
beforeEach(async () => { await resetDatabase(); });

describe('lunar yearly event series', () => {
  test('starts on the first lunar date after startsOn and keeps the birthday marks', async () => {
    const token = await insertActor('lunar-create-owner');
    const householdId = await createHousehold(token);
    const created = await request(token, 'POST', `/api/v1/households/${householdId}/events`, lunarBirthday());
    expect(created.statusCode).toBe(201);
    const event = created.json();
    const first = lunarDateFrom(today, 10, 15);
    expect(event.occurrenceDate).toBe(first);
    expect(event.startTime).toBe(new Date(`${first}T00:00:00+08:00`).toISOString());
    expect(event.recurrence).toMatchObject({ freq: 'yearly', lunar: { month: 10, day: 15 }, occasion: 'birthday', birthYear: 1968 });

    const stored = await withDatabase(client => client.query(
      `SELECT "lunar_month", "lunar_day", "occasion", "birth_year" FROM "recurrence_rules" WHERE "id" = $1`, [event.recurrenceRuleId],
    ));
    expect(stored.rows).toEqual([{ lunar_month: 10, lunar_day: 15, occasion: 'birthday', birth_year: 1968 }]);
  });

  test('appears on its lunar date when a later year is browsed', async () => {
    const token = await insertActor('lunar-browse-owner');
    const householdId = await createHousehold(token);
    expect((await request(token, 'POST', `/api/v1/households/${householdId}/events`, lunarBirthday())).statusCode).toBe(201);
    // Two lunar years on, far past what the scheduler generates ahead.
    const first = lunarDateFrom(today, 10, 15);
    const later = formatIsoDate(lunarAnniversary(toLunar(parseIsoDate(first))!.year + 2, 10, 15)!);
    const from = formatIsoDate(addDays(parseIsoDate(later), -40));
    const through = formatIsoDate(addDays(parseIsoDate(later), 40));

    const listed = await request(token, 'GET', `/api/v1/households/${householdId}/events?expandRecurring=true&startDate=${from}&endDate=${through}`);
    expect(listed.statusCode).toBe(200);
    const dates = (listed.json().events as Array<{ occurrenceDate: string }>).map(row => row.occurrenceDate);
    expect(dates).toEqual([later]);
  });

  test('lists the birthday with its next lunar occurrence', async () => {
    const token = await insertActor('lunar-list-owner');
    const householdId = await createHousehold(token);
    const created = (await request(token, 'POST', `/api/v1/households/${householdId}/events`, lunarBirthday())).json();

    const listed = await request(token, 'GET', `/api/v1/households/${householdId}/recurrence-rules`);
    expect(listed.statusCode).toBe(200);
    expect(listed.json().rules).toEqual([expect.objectContaining({
      id: created.recurrenceRuleId, kind: 'event', title: '妈妈的农历生日',
      lunar: { month: 10, day: 15 }, occasion: 'birthday', birthYear: 1968,
      nextOccurrenceDate: lunarDateFrom(today, 10, 15),
    })]);
  });

  test('rejects a lunar date or a birthday on anything but a yearly rule, and stores nothing', async () => {
    const token = await insertActor('lunar-invalid-owner');
    const householdId = await createHousehold(token);
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ freq: 'monthly', occasion: null, birthYear: null }, 'recurrence.lunar'],
      [{ freq: 'weekly', byWeekday: [1], lunar: undefined, birthYear: null }, 'recurrence.occasion'],
      [{ occasion: null }, 'recurrence.birthYear'],
    ];
    for (const [extra, field] of cases) {
      const response = await request(token, 'POST', `/api/v1/households/${householdId}/events`, lunarBirthday(extra));
      expect(response.statusCode, field).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_FAILED');
      expect(response.json().error.details.map((detail: { field: string }) => detail.field)).toContain(field);
    }
    const outOfRange = await request(token, 'POST', `/api/v1/households/${householdId}/events`, lunarBirthday({ lunar: { month: 13, day: 31 } }));
    expect(outOfRange.statusCode).toBe(400);

    const rules = await withDatabase(client => client.query(`SELECT count(*)::int AS count FROM "recurrence_rules"`));
    expect(rules.rows[0].count).toBe(0);
  });
});

describe('editing a birthday series', () => {
  test('a rule edit replaces the lunar date and keeps the birthday unless it is cleared', async () => {
    const token = await insertActor('lunar-edit-owner');
    const householdId = await createHousehold(token);
    const created = (await request(token, 'POST', `/api/v1/households/${householdId}/events`, lunarBirthday())).json();
    const rulesUrl = `/api/v1/households/${householdId}/recurrence-rules`;

    const moved = await request(token, 'PUT', `${rulesUrl}/${created.recurrenceRuleId}`, {
      recurrence: { freq: 'yearly', startsOn: today, timezone: TIME_ZONE, lunar: { month: 11, day: 8 } },
    });
    expect(moved.statusCode).toBe(200);
    const successorId = moved.json().recurrenceRuleId as string;
    const successor = (await request(token, 'GET', `${rulesUrl}/${successorId}`)).json();
    expect(successor).toMatchObject({ lunar: { month: 11, day: 8 }, occasion: 'birthday', birthYear: 1968 });
    // A rule edit takes effect from tomorrow.
    expect(successor.nextOccurrenceDate).toBe(lunarDateFrom(formatIsoDate(addDays(parseIsoDate(today), 1)), 11, 8));

    const cleared = await request(token, 'PUT', `${rulesUrl}/${successorId}`, {
      recurrence: { freq: 'yearly', startsOn: today, timezone: TIME_ZONE, lunar: { month: 11, day: 8 }, birthYear: null },
    });
    expect(cleared.statusCode).toBe(200);
    const latest = (await request(token, 'GET', `${rulesUrl}/${cleared.json().recurrenceRuleId}`)).json();
    expect(latest).toMatchObject({ occasion: 'birthday', birthYear: null });
  });

  test('renaming this and following occurrences keeps the lunar date and the birthday', async () => {
    const token = await insertActor('lunar-split-owner');
    const householdId = await createHousehold(token);
    const created = (await request(token, 'POST', `/api/v1/households/${householdId}/events`, lunarBirthday())).json();

    const renamed = await request(token, 'PUT', `/api/v1/households/${householdId}/events/${created.id}/series`, { title: '妈妈生日（农历）' });
    expect(renamed.statusCode).toBe(200);
    const successor = (await request(token, 'GET', `/api/v1/households/${householdId}/recurrence-rules/${renamed.json().recurrenceRuleId}`)).json();
    expect(successor).toMatchObject({
      title: '妈妈生日（农历）', lunar: { month: 10, day: 15 }, occasion: 'birthday', birthYear: 1968,
      nextOccurrenceDate: lunarDateFrom(today, 10, 15),
    });
  });
});
