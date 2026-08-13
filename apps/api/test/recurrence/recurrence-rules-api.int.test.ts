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
  type CalendarDate,
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
      [userId, email, email.toLowerCase(), 'recurrence rules api actor', passwordHash],
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
    payload: { name: 'Recurrence rules API household' },
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InjectResponse = { statusCode: number; json: () => any };

async function taskApi(
  accessToken: string,
  householdId: string,
  method: 'GET' | 'POST' | 'PUT',
  path: string = '',
  payload?: unknown,
): Promise<InjectResponse> {
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
  return response as InjectResponse;
}

async function eventApi(
  accessToken: string,
  householdId: string,
  method: 'GET' | 'POST',
  path: string = '',
  payload?: unknown,
): Promise<InjectResponse> {
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
  return response as InjectResponse;
}

async function recurrenceRulesApi(
  accessToken: string,
  householdId: string,
  method: 'GET' | 'POST' | 'PUT',
  path: string = '',
  payload?: unknown,
): Promise<InjectResponse> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (app.getHttpAdapter().getInstance() as any).inject({
    method,
    url: `/api/v1/households/${encodeURIComponent(householdId)}/recurrence-rules${path}`,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(payload === undefined ? {} : { payload }),
  });
  return response as InjectResponse;
}

function weekdayOf(date: CalendarDate): number {
  return new Date(`${formatIsoDate(date)}T00:00:00.000Z`).getUTCDay();
}

async function occurrenceDatesFor(table: 'tasks' | 'events', ruleId: string): Promise<string[]> {
  const result = await withDatabase((client) => client.query(
    `SELECT to_char("occurrence_date", 'YYYY-MM-DD') AS day FROM "${table}"
      WHERE "recurrence_rule_id" = $1 ORDER BY "occurrence_date"`,
    [ruleId],
  ));
  return (result.rows as Array<{ day: string }>).map((row) => row.day);
}

// ends_on is a bare DATE column: read it through to_char so the pg driver's
// local-midnight Date coercion cannot shift the calendar day under assertion.
async function ruleBounds(ruleId: string): Promise<{ endsOn: string | null; count: number | null }> {
  const result = await withDatabase((client) => client.query(
    `SELECT to_char("ends_on", 'YYYY-MM-DD') AS ends_on, "count" FROM "recurrence_rules" WHERE "id" = $1`,
    [ruleId],
  ));
  const row = result.rows[0] as { ends_on: string | null; count: number | null } | undefined;
  expect(row).toBeDefined();
  return { endsOn: row!.ends_on, count: row!.count };
}

interface RuleRow {
  startsOn: string;
  endsOn: string | null;
  count: number | null;
  freq: string;
  byWeekday: number[];
  templateTitle: string;
  startTimeLocal: string | null;
  durationMinutes: number | null;
}

// Same to_char discipline as ruleBounds: starts_on/ends_on are bare DATE
// columns and must not go through the driver's local-midnight coercion.
async function ruleRow(ruleId: string): Promise<RuleRow> {
  const result = await withDatabase((client) => client.query(
    `SELECT to_char("starts_on", 'YYYY-MM-DD') AS starts_on,
            to_char("ends_on", 'YYYY-MM-DD') AS ends_on,
            "count", "freq", "by_weekday", "template_title",
            "start_time_local", "duration_minutes"
       FROM "recurrence_rules" WHERE "id" = $1`,
    [ruleId],
  ));
  const row = result.rows[0] as Record<string, never> | undefined;
  expect(row).toBeDefined();
  const value = row as unknown as {
    starts_on: string; ends_on: string | null; count: number | null; freq: string;
    by_weekday: number[]; template_title: string;
    start_time_local: string | null; duration_minutes: number | null;
  };
  return {
    startsOn: value.starts_on,
    endsOn: value.ends_on,
    count: value.count,
    freq: value.freq,
    byWeekday: value.by_weekday,
    templateTitle: value.template_title,
    startTimeLocal: value.start_time_local,
    durationMinutes: value.duration_minutes,
  };
}

async function instancesFor(
  table: 'tasks' | 'events',
  ruleId: string,
): Promise<Array<{ id: string; day: string; title: string }>> {
  const result = await withDatabase((client) => client.query(
    `SELECT "id", "title", to_char("occurrence_date", 'YYYY-MM-DD') AS day FROM "${table}"
      WHERE "recurrence_rule_id" = $1 ORDER BY "occurrence_date"`,
    [ruleId],
  ));
  return result.rows as Array<{ id: string; day: string; title: string }>;
}

async function taskAssigneeIds(taskId: string): Promise<string[]> {
  const result = await withDatabase((client) => client.query(
    `SELECT "user_id" FROM "task_assignees" WHERE "task_id" = $1 ORDER BY "user_id"`,
    [taskId],
  ));
  return (result.rows as Array<{ user_id: string }>).map((row) => row.user_id);
}

async function labelNamesFor(table: 'task_labels' | 'event_labels', column: 'task_id' | 'event_id', ownerId: string): Promise<string[]> {
  const result = await withDatabase((client) => client.query(
    `SELECT l."name" FROM "${table}" tl JOIN "labels" l ON l."id" = tl."label_id"
      WHERE tl."${column}" = $1 ORDER BY l."name"`,
    [ownerId],
  ));
  return (result.rows as Array<{ name: string }>).map((row) => row.name);
}

async function ruleCountFor(householdId: string): Promise<number> {
  const result = await withDatabase((client) => client.query(
    `SELECT count(*)::int AS total FROM "recurrence_rules" WHERE "household_id" = $1`,
    [householdId],
  ));
  return (result.rows[0] as { total: number }).total;
}

interface RuleListItem {
  id: string;
  kind: 'task' | 'event' | null;
  title: string;
  freq: string;
  nextOccurrenceDate: string | null;
  [key: string]: unknown;
}

beforeAll(async () => {
  passwordHash = await argon2.hash('recurrence-rules-api-fixture-password', {
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

describe('GET /households/:householdId/recurrence-rules', () => {
  test('returns the correct nextOccurrenceDate for a healthy weekly rule with zero future instance rows', async () => {
    const owner = await insertActor('rules-window-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);

    // D-16's core regression: biweekly (interval=2) means the gap between
    // occurrences is 14 days — far wider than the 6-day weekly lookahead.
    // Anchoring the last occurrence 7 days ago means the NEXT occurrence is
    // exactly 7 days from now, comfortably outside the materialization
    // horizon (today+6), so no future instance row exists for it.
    const today = currentCalendarDateIn('UTC');
    const startsOn = formatIsoDate(addDays(today, -7));
    const todayWeekday = new Date(`${formatIsoDate(today)}T00:00:00.000Z`).getUTCDay();
    const response = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: 'Biweekly outside-window task',
      recurrence: {
        freq: 'weekly',
        interval: 2,
        byWeekday: [todayWeekday],
        startsOn,
        timezone: 'UTC',
      },
    });
    expect(response.statusCode).toBe(201);
    const ruleId = (response.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    // Confirm the premise: no task row exists strictly after today.
    const futureRows = await withDatabase((client) => client.query(
      `SELECT id FROM tasks WHERE recurrence_rule_id = $1 AND occurrence_date > $2::date`,
      [ruleId, formatIsoDate(today)],
    ));
    expect(futureRows.rows).toHaveLength(0);

    const listed = await recurrenceRulesApi(owner.accessToken, householdId, 'GET');
    expect(listed.statusCode).toBe(200);
    const body = listed.json() as { rules: RuleListItem[]; total: number };
    const item = body.rules.find((rule) => rule.id === ruleId);
    expect(item).toBeDefined();
    const expectedNext = formatIsoDate(addDays(today, 7));
    expect(item!.nextOccurrenceDate).toBe(expectedNext);
  });

  test('merges a task rule and an event rule into one list with correctly derived kinds', async () => {
    const owner = await insertActor('rules-kind-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const today = formatIsoDate(currentCalendarDateIn('UTC'));

    const taskResponse = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: 'Daily household task rule',
      recurrence: { freq: 'daily', startsOn: today, timezone: 'UTC' },
    });
    expect(taskResponse.statusCode).toBe(201);
    const taskRuleId = (taskResponse.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    const eventResponse = await eventApi(owner.accessToken, householdId, 'POST', '', {
      title: 'Daily household event rule',
      startTime: `${today}T09:00:00.000Z`,
      endTime: `${today}T10:00:00.000Z`,
      recurrence: { freq: 'daily', startsOn: today, timezone: 'UTC' },
    });
    expect(eventResponse.statusCode).toBe(201);
    const eventRuleId = (eventResponse.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    const listed = await recurrenceRulesApi(owner.accessToken, householdId, 'GET');
    expect(listed.statusCode).toBe(200);
    const body = listed.json() as { rules: RuleListItem[]; total: number };
    expect(body.total).toBe(2);
    const taskItem = body.rules.find((rule) => rule.id === taskRuleId);
    const eventItem = body.rules.find((rule) => rule.id === eventRuleId);
    expect(taskItem?.kind).toBe('task');
    expect(eventItem?.kind).toBe('event');
  });

  test('reports the template title, not a renamed instance title', async () => {
    const owner = await insertActor('rules-title-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const today = currentCalendarDateIn('UTC');
    const startsOn = formatIsoDate(addDays(today, -2));

    const created = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: 'Original series title',
      recurrence: { freq: 'daily', startsOn, count: 5, timezone: 'UTC' },
    });
    expect(created.statusCode).toBe(201);
    const ruleId = (created.json() as { recurrenceRuleId: string }).recurrenceRuleId;
    const seedTaskId = (created.json() as { id: string }).id;

    const renamed = await taskApi(owner.accessToken, householdId, 'PUT', `/${seedTaskId}`, {
      title: 'Renamed just this occurrence',
    });
    expect(renamed.statusCode).toBe(200);

    const listed = await recurrenceRulesApi(owner.accessToken, householdId, 'GET');
    const body = listed.json() as { rules: RuleListItem[] };
    const item = body.rules.find((rule) => rule.id === ruleId);
    expect(item?.title).toBe('Original series title');
  });

  test('returns null nextOccurrenceDate for an exhausted rule and sorts it after unended rules', async () => {
    const owner = await insertActor('rules-sort-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const today = currentCalendarDateIn('UTC');

    // Exhausted: count=1, starting well in the past so its single occurrence
    // is long gone.
    const exhausted = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: 'Zzz exhausted rule',
      recurrence: { freq: 'daily', startsOn: formatIsoDate(addDays(today, -30)), count: 1, timezone: 'UTC' },
    });
    expect(exhausted.statusCode).toBe(201);
    const exhaustedRuleId = (exhausted.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    // Healthy: still recurring daily from today.
    const healthy = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: 'Aaa healthy rule',
      recurrence: { freq: 'daily', startsOn: formatIsoDate(today), timezone: 'UTC' },
    });
    expect(healthy.statusCode).toBe(201);
    const healthyRuleId = (healthy.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    const listed = await recurrenceRulesApi(owner.accessToken, householdId, 'GET');
    const body = listed.json() as { rules: RuleListItem[]; total: number };
    expect(body.total).toBe(2);
    const exhaustedItem = body.rules.find((rule) => rule.id === exhaustedRuleId);
    const healthyItem = body.rules.find((rule) => rule.id === healthyRuleId);
    expect(exhaustedItem?.nextOccurrenceDate).toBeNull();
    expect(healthyItem?.nextOccurrenceDate).not.toBeNull();
    // Unended rules sort before ended/exhausted ones regardless of title.
    const healthyIndex = body.rules.findIndex((rule) => rule.id === healthyRuleId);
    const exhaustedIndex = body.rules.findIndex((rule) => rule.id === exhaustedRuleId);
    expect(healthyIndex).toBeLessThan(exhaustedIndex);
  });

  test('never includes createdBy or householdId in list items', async () => {
    const owner = await insertActor('rules-shape-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const today = formatIsoDate(currentCalendarDateIn('UTC'));
    const created = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: 'Shape check rule',
      recurrence: { freq: 'daily', startsOn: today, timezone: 'UTC' },
    });
    expect(created.statusCode).toBe(201);

    const listed = await recurrenceRulesApi(owner.accessToken, householdId, 'GET');
    const body = listed.json() as { rules: RuleListItem[] };
    expect(body.rules).toHaveLength(1);
    const keys = Object.keys(body.rules[0]!);
    expect(keys).not.toContain('createdBy');
    expect(keys).not.toContain('householdId');
  });

  test('does not disclose household existence to a non-member', async () => {
    const owner = await insertActor('rules-list-owner@example.test');
    const outsider = await insertActor('rules-list-outsider@example.test');
    const householdId = await createHousehold(owner.accessToken);

    const response = await recurrenceRulesApi(outsider.accessToken, householdId, 'GET');
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('HOUSEHOLD_NOT_FOUND');
  });
});

describe('GET /households/:householdId/recurrence-rules/:ruleId', () => {
  test('returns 404 RECURRENCE_RULE_NOT_FOUND for a ruleId from another household', async () => {
    const owner = await insertActor('rules-detail-owner@example.test');
    const otherOwner = await insertActor('rules-detail-other@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const otherHouseholdId = await createHousehold(otherOwner.accessToken);
    const today = formatIsoDate(currentCalendarDateIn('UTC'));

    const created = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: 'Cross household rule',
      recurrence: { freq: 'daily', startsOn: today, timezone: 'UTC' },
    });
    expect(created.statusCode).toBe(201);
    const ruleId = (created.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    const response = await recurrenceRulesApi(otherOwner.accessToken, otherHouseholdId, 'GET', `/${ruleId}`);
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('RECURRENCE_RULE_NOT_FOUND');
  });

  test('returns 404 HOUSEHOLD_NOT_FOUND for a non-member before any rule lookup', async () => {
    const owner = await insertActor('rules-detail-member-owner@example.test');
    const outsider = await insertActor('rules-detail-member-outsider@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const today = formatIsoDate(currentCalendarDateIn('UTC'));

    const created = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: 'Member-gated rule',
      recurrence: { freq: 'daily', startsOn: today, timezone: 'UTC' },
    });
    expect(created.statusCode).toBe(201);
    const ruleId = (created.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    const response = await recurrenceRulesApi(outsider.accessToken, householdId, 'GET', `/${ruleId}`);
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('HOUSEHOLD_NOT_FOUND');
  });

  test('rejects a malformed ruleId with 400 rather than a driver-level 500', async () => {
    const owner = await insertActor('rules-detail-malformed-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);

    const response = await recurrenceRulesApi(owner.accessToken, householdId, 'GET', '/not-a-uuid');
    expect(response.statusCode).toBe(400);
  });
});

describe('POST /households/:householdId/recurrence-rules/:ruleId/end', () => {
  // The daily lookahead is 0 days (D-11), so a daily rule can never have a
  // materialized "tomorrow" row — there would be nothing on the far side of
  // the anchor to assert against. A weekly rule covering BOTH today's and
  // tomorrow's weekday materializes exactly the two rows the anchor sits
  // between, which is what these tests need.
  function straddlingWeeklyRecurrence(today: CalendarDate, startsOn: CalendarDate): Record<string, unknown> {
    return {
      freq: 'weekly',
      byWeekday: [weekdayOf(today), weekdayOf(addDays(today, 1))],
      startsOn: formatIsoDate(startsOn),
      timezone: 'UTC',
    };
  }

  test("keeps today's occurrence, removes tomorrow's, and ends the rule on today", async () => {
    const owner = await insertActor('end-anchor-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const today = currentCalendarDateIn('UTC');
    const tomorrow = addDays(today, 1);

    const created = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: 'Rule ended from the rule itself',
      recurrence: straddlingWeeklyRecurrence(today, today),
    });
    expect(created.statusCode).toBe(201);
    const ruleId = (created.json() as { recurrenceRuleId: string }).recurrenceRuleId;
    // Premise: both sides of the anchor exist before the end.
    expect(await occurrenceDatesFor('tasks', ruleId))
      .toEqual([formatIsoDate(today), formatIsoDate(tomorrow)]);

    const ended = await recurrenceRulesApi(owner.accessToken, householdId, 'POST', `/${ruleId}/end`);
    expect(ended.statusCode).toBe(204);

    // D-14: the anchor is TOMORROW. Today's occurrence may already be done —
    // ending the recurrence must not swallow it.
    expect(await occurrenceDatesFor('tasks', ruleId)).toEqual([formatIsoDate(today)]);
    expect((await ruleBounds(ruleId)).endsOn).toBe(formatIsoDate(today));
  });

  test('preserves every historical occurrence row that existed before the end', async () => {
    const owner = await insertActor('end-history-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const today = currentCalendarDateIn('UTC');

    const created = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: 'Rule with history',
      recurrence: straddlingWeeklyRecurrence(today, addDays(today, -7)),
    });
    expect(created.statusCode).toBe(201);
    const ruleId = (created.json() as { recurrenceRuleId: string }).recurrenceRuleId;
    const before = await occurrenceDatesFor('tasks', ruleId);
    const historical = before.filter((day) => day < formatIsoDate(today));
    expect(historical.length).toBeGreaterThan(0);

    const ended = await recurrenceRulesApi(owner.accessToken, householdId, 'POST', `/${ruleId}/end`);
    expect(ended.statusCode).toBe(204);

    const after = await occurrenceDatesFor('tasks', ruleId);
    for (const day of historical) {
      expect(after).toContain(day);
    }
    expect(after).toEqual([...historical, formatIsoDate(today)]);
  });

  test('clears a count bound to NULL and replaces it with an endsOn date', async () => {
    const owner = await insertActor('end-count-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const today = currentCalendarDateIn('UTC');

    const created = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: 'Count bounded rule',
      recurrence: { ...straddlingWeeklyRecurrence(today, today), count: 10 },
    });
    expect(created.statusCode).toBe(201);
    const ruleId = (created.json() as { recurrenceRuleId: string }).recurrenceRuleId;
    expect((await ruleBounds(ruleId)).count).toBe(10);

    const ended = await recurrenceRulesApi(owner.accessToken, householdId, 'POST', `/${ruleId}/end`);
    expect(ended.statusCode).toBe(204);

    // endsOn and count are mutually exclusive bounds — a date bound must
    // leave count NULL, never both set.
    const bounds = await ruleBounds(ruleId);
    expect(bounds.count).toBeNull();
    expect(bounds.endsOn).toBe(formatIsoDate(today));
  });

  test('applies identically to an event rule', async () => {
    const owner = await insertActor('end-event-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const today = currentCalendarDateIn('UTC');
    const tomorrow = addDays(today, 1);
    const todayIso = formatIsoDate(today);

    const created = await eventApi(owner.accessToken, householdId, 'POST', '', {
      title: 'Event rule to end',
      startTime: `${todayIso}T09:00:00.000Z`,
      endTime: `${todayIso}T10:00:00.000Z`,
      recurrence: straddlingWeeklyRecurrence(today, today),
    });
    expect(created.statusCode).toBe(201);
    const ruleId = (created.json() as { recurrenceRuleId: string }).recurrenceRuleId;
    expect(await occurrenceDatesFor('events', ruleId)).toEqual([todayIso, formatIsoDate(tomorrow)]);

    const ended = await recurrenceRulesApi(owner.accessToken, householdId, 'POST', `/${ruleId}/end`);
    expect(ended.statusCode).toBe(204);

    expect(await occurrenceDatesFor('events', ruleId)).toEqual([todayIso]);
    expect((await ruleBounds(ruleId)).endsOn).toBe(todayIso);
  });

  test('returns 404 RECURRENCE_RULE_NOT_FOUND for a ruleId belonging to another household', async () => {
    const owner = await insertActor('end-cross-owner@example.test');
    const otherOwner = await insertActor('end-cross-other@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const otherHouseholdId = await createHousehold(otherOwner.accessToken);
    const today = currentCalendarDateIn('UTC');

    const created = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: 'Rule of another household',
      recurrence: straddlingWeeklyRecurrence(today, today),
    });
    expect(created.statusCode).toBe(201);
    const ruleId = (created.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    const response = await recurrenceRulesApi(otherOwner.accessToken, otherHouseholdId, 'POST', `/${ruleId}/end`);
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('RECURRENCE_RULE_NOT_FOUND');
    // The rule must be untouched by the rejected attempt.
    expect((await ruleBounds(ruleId)).endsOn).toBeNull();
  });

  test('returns 404 HOUSEHOLD_NOT_FOUND for a non-member before any rule lookup', async () => {
    const owner = await insertActor('end-outsider-owner@example.test');
    const outsider = await insertActor('end-outsider@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const today = currentCalendarDateIn('UTC');

    const created = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: 'Member gated rule',
      recurrence: straddlingWeeklyRecurrence(today, today),
    });
    expect(created.statusCode).toBe(201);
    const ruleId = (created.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    const response = await recurrenceRulesApi(outsider.accessToken, householdId, 'POST', `/${ruleId}/end`);
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('HOUSEHOLD_NOT_FOUND');
    expect((await ruleBounds(ruleId)).endsOn).toBeNull();
  });

  test("rejects a member ending another member's rule with 403 FORBIDDEN", async () => {
    const owner = await insertActor('end-member-owner@example.test');
    const member = await insertActor('end-member-other@example.test');
    const householdId = await createHousehold(owner.accessToken);
    await addMemberViaDb(householdId, member);
    const today = currentCalendarDateIn('UTC');

    const created = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: "Owner's rule",
      recurrence: straddlingWeeklyRecurrence(today, today),
    });
    expect(created.statusCode).toBe(201);
    const ruleId = (created.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    const response = await recurrenceRulesApi(member.accessToken, householdId, 'POST', `/${ruleId}/end`);
    // 403, not 404: the member can legitimately SEE this rule, so hiding its
    // existence here would contradict the list endpoint.
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
    expect((await ruleBounds(ruleId)).endsOn).toBeNull();
  });

  test('lets a member end a rule they created themselves', async () => {
    const owner = await insertActor('end-own-owner@example.test');
    const member = await insertActor('end-own-member@example.test');
    const householdId = await createHousehold(owner.accessToken);
    await addMemberViaDb(householdId, member);
    const today = currentCalendarDateIn('UTC');

    const created = await taskApi(member.accessToken, householdId, 'POST', '', {
      title: "Member's own rule",
      recurrence: straddlingWeeklyRecurrence(today, today),
    });
    expect(created.statusCode).toBe(201);
    const ruleId = (created.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    const response = await recurrenceRulesApi(member.accessToken, householdId, 'POST', `/${ruleId}/end`);
    expect(response.statusCode).toBe(204);
    expect((await ruleBounds(ruleId)).endsOn).toBe(formatIsoDate(today));
  });

  test('keeps an ended rule in the list with a null nextOccurrenceDate', async () => {
    const owner = await insertActor('end-still-listed-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const today = currentCalendarDateIn('UTC');
    const tomorrow = addDays(today, 1);

    // Deliberately a rule whose only occurrences fall strictly after today:
    // ending it anchors on tomorrow, so nothing survives on or after today
    // and the next occurrence genuinely becomes null.
    const created = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: 'Rule that will be ended',
      recurrence: {
        freq: 'weekly',
        byWeekday: [weekdayOf(tomorrow)],
        startsOn: formatIsoDate(tomorrow),
        timezone: 'UTC',
      },
    });
    expect(created.statusCode).toBe(201);
    const ruleId = (created.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    const beforeList = await recurrenceRulesApi(owner.accessToken, householdId, 'GET');
    const beforeItem = (beforeList.json() as { rules: RuleListItem[] }).rules
      .find((rule) => rule.id === ruleId);
    expect(beforeItem?.nextOccurrenceDate).toBe(formatIsoDate(tomorrow));

    const ended = await recurrenceRulesApi(owner.accessToken, householdId, 'POST', `/${ruleId}/end`);
    expect(ended.statusCode).toBe(204);

    // D-14: "ended" is not "deleted" — the rule stays visible in the list.
    const afterList = await recurrenceRulesApi(owner.accessToken, householdId, 'GET');
    expect(afterList.statusCode).toBe(200);
    const afterBody = afterList.json() as { rules: RuleListItem[]; total: number };
    expect(afterBody.total).toBe(1);
    const afterItem = afterBody.rules.find((rule) => rule.id === ruleId);
    expect(afterItem).toBeDefined();
    expect(afterItem!.nextOccurrenceDate).toBeNull();
  });

  test('is idempotent: ending an already ended rule changes nothing', async () => {
    const owner = await insertActor('end-idempotent-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const today = currentCalendarDateIn('UTC');

    const created = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: 'Rule ended twice',
      recurrence: straddlingWeeklyRecurrence(today, addDays(today, -7)),
    });
    expect(created.statusCode).toBe(201);
    const ruleId = (created.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    const first = await recurrenceRulesApi(owner.accessToken, householdId, 'POST', `/${ruleId}/end`);
    expect(first.statusCode).toBe(204);
    const rowsAfterFirst = await occurrenceDatesFor('tasks', ruleId);
    const boundsAfterFirst = await ruleBounds(ruleId);

    const second = await recurrenceRulesApi(owner.accessToken, householdId, 'POST', `/${ruleId}/end`);
    expect(second.statusCode).toBe(204);
    expect(await occurrenceDatesFor('tasks', ruleId)).toEqual(rowsAfterFirst);
    expect(await ruleBounds(ruleId)).toEqual(boundsAfterFirst);
  });
});

describe('PUT /households/:householdId/recurrence-rules/:ruleId', () => {
  // Same constraint the end-anchor block documents: the daily lookahead is 0
  // days (D-11), so a DAILY rule never materializes a "tomorrow" row and a
  // daily fixture would leave nothing on the far side of the anchor to assert
  // against. A weekly rule covering the weekdays of the given days
  // materializes exactly those rows.
  function weeklyAcross(
    days: CalendarDate[],
    startsOn: CalendarDate,
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      freq: 'weekly',
      byWeekday: [...new Set(days.map(weekdayOf))],
      startsOn: formatIsoDate(startsOn),
      timezone: 'UTC',
      ...extra,
    };
  }

  // The successor requested by most cases below is DAILY starting at the
  // anchor. That is deliberate: a daily rule's lookahead is 0 days, so the
  // materializer generates nothing for it at all — every row found under the
  // successor can only be the seed row the split itself wrote.
  function dailyFrom(anchor: CalendarDate, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { freq: 'daily', startsOn: formatIsoDate(anchor), timezone: 'UTC', ...extra };
  }

  async function createLabel(accessToken: string, householdId: string, name: string): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (app.getHttpAdapter().getInstance() as any).inject({
      method: 'POST',
      url: `/api/v1/households/${householdId}/labels`,
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      payload: { name, color: '#FF8A65' },
    });
    expect(response.statusCode).toBe(201);
    return (response.json() as { id: string }).id;
  }

  async function tagTask(
    accessToken: string,
    householdId: string,
    taskId: string,
    labelIds: string[],
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (app.getHttpAdapter().getInstance() as any).inject({
      method: 'POST',
      url: `/api/v1/households/${householdId}/tasks/${taskId}/labels`,
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      payload: { labelIds },
    });
    expect(response.statusCode).toBeLessThan(300);
  }

  test('splits at tomorrow: history survives, the future moves to the successor', async () => {
    const owner = await insertActor('rule-edit-anchor-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const today = currentCalendarDateIn('UTC');
    const yesterday = addDays(today, -1);
    const tomorrow = addDays(today, 1);

    const created = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: 'Rule edited from the rule itself',
      recurrence: weeklyAcross([yesterday, today, tomorrow], yesterday),
    });
    expect(created.statusCode).toBe(201);
    const oldRuleId = (created.json() as { recurrenceRuleId: string }).recurrenceRuleId;
    // Premise, asserted rather than assumed: rows exist on BOTH sides of the
    // anchor before the edit, so the split has something to move and
    // something to leave behind.
    const before = await occurrenceDatesFor('tasks', oldRuleId);
    expect(before).toContain(formatIsoDate(yesterday));
    expect(before).toContain(formatIsoDate(today));
    expect(before).toContain(formatIsoDate(tomorrow));

    const response = await recurrenceRulesApi(
      owner.accessToken, householdId, 'PUT', `/${oldRuleId}`,
      { recurrence: dailyFrom(tomorrow) },
    );
    expect(response.statusCode).toBe(200);
    const newRuleId = (response.json() as { recurrenceRuleId: string }).recurrenceRuleId;
    expect(newRuleId).not.toBe(oldRuleId);

    // Yesterday and today are untouched — a rule-level edit anchors on
    // TOMORROW, so today's (possibly already completed) occurrence survives.
    expect(await occurrenceDatesFor('tasks', oldRuleId))
      .toEqual([formatIsoDate(yesterday), formatIsoDate(today)]);
    const oldBounds = await ruleBounds(oldRuleId);
    expect(oldBounds.endsOn).toBe(formatIsoDate(today));
    expect(oldBounds.count).toBeNull();

    const successor = await ruleRow(newRuleId);
    expect(successor.startsOn).toBe(formatIsoDate(tomorrow));
    expect(successor.freq).toBe('daily');
  });

  test('takes the successor template from the RULE, never from a renamed instance', async () => {
    const owner = await insertActor('rule-edit-template-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const today = currentCalendarDateIn('UTC');
    const tomorrow = addDays(today, 1);

    const created = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: 'Series template title',
      recurrence: weeklyAcross([today, tomorrow], addDays(today, -7)),
    });
    expect(created.statusCode).toBe(201);
    const oldRuleId = (created.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    // Rename EVERY instance to something distinct. D-02/D-07 make each
    // occurrence independently renameable, so after this no instance row
    // carries the series title any more — a template read off any instance
    // whatsoever produces a "Renamed …" value and fails the assertion below.
    const instances = await instancesFor('tasks', oldRuleId);
    expect(instances.length).toBeGreaterThan(1);
    for (const instance of instances) {
      const renamed = await taskApi(owner.accessToken, householdId, 'PUT', `/${instance.id}`, {
        title: `Renamed ${instance.day}`,
      });
      expect(renamed.statusCode).toBe(200);
    }

    const response = await recurrenceRulesApi(
      owner.accessToken, householdId, 'PUT', `/${oldRuleId}`,
      { recurrence: dailyFrom(tomorrow) },
    );
    expect(response.statusCode).toBe(200);
    const newRuleId = (response.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    // CR-01's payoff: the successor's template comes from the old rule's
    // template_* columns, so one occurrence's rename cannot leak into every
    // occurrence the successor will ever generate.
    expect((await ruleRow(newRuleId)).templateTitle).toBe('Series template title');
    const seeded = await instancesFor('tasks', newRuleId);
    expect(seeded).toHaveLength(1);
    expect(seeded[0]!.title).toBe('Series template title');
  });

  test('writes a seed instance row at the successor\'s first occurrence from the anchor', async () => {
    const owner = await insertActor('rule-edit-seed-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const today = currentCalendarDateIn('UTC');
    const tomorrow = addDays(today, 1);

    const created = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: 'Rule needing a seed row',
      recurrence: weeklyAcross([today, tomorrow], today),
    });
    expect(created.statusCode).toBe(201);
    const oldRuleId = (created.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    const response = await recurrenceRulesApi(
      owner.accessToken, householdId, 'PUT', `/${oldRuleId}`,
      { recurrence: dailyFrom(tomorrow) },
    );
    expect(response.statusCode).toBe(200);
    const newRuleId = (response.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    // D-17's guard. The successor is DAILY starting tomorrow and the daily
    // lookahead is 0 days, so the materializer contributes nothing: this row
    // exists only because the split wrote it. Without the seed the successor
    // would be a permanently row-less rule whose kind cannot even be derived.
    expect(await occurrenceDatesFor('tasks', newRuleId)).toEqual([formatIsoDate(tomorrow)]);
  });

  test('inherits assignees and labels from the earliest instance at or after the anchor', async () => {
    const owner = await insertActor('rule-edit-inherit-owner@example.test');
    const member = await insertActor('rule-edit-inherit-member@example.test');
    const householdId = await createHousehold(owner.accessToken);
    await addMemberViaDb(householdId, member);
    const today = currentCalendarDateIn('UTC');
    const tomorrow = addDays(today, 1);

    const nearLabelId = await createLabel(owner.accessToken, householdId, '锚点之后');
    const farLabelId = await createLabel(owner.accessToken, householdId, '锚点之前');

    const created = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: 'Rule with assignees and labels',
      assigneeIds: [owner.userId, member.userId],
      recurrence: weeklyAcross([today, tomorrow], today),
    });
    expect(created.statusCode).toBe(201);
    const oldRuleId = (created.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    const instances = await instancesFor('tasks', oldRuleId);
    expect(instances.map((row) => row.day)).toEqual([formatIsoDate(today), formatIsoDate(tomorrow)]);
    // Distinct labels on either side of the anchor, so the assertion below
    // pins WHICH instance was used as the inheritance source, not merely that
    // some label was copied.
    await tagTask(owner.accessToken, householdId, instances[0]!.id, [farLabelId]);
    await tagTask(owner.accessToken, householdId, instances[1]!.id, [nearLabelId]);

    const response = await recurrenceRulesApi(
      owner.accessToken, householdId, 'PUT', `/${oldRuleId}`,
      { recurrence: dailyFrom(tomorrow) },
    );
    expect(response.statusCode).toBe(200);
    const newRuleId = (response.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    const seeded = await instancesFor('tasks', newRuleId);
    expect(seeded).toHaveLength(1);
    expect(await taskAssigneeIds(seeded[0]!.id)).toEqual([owner.userId, member.userId].sort());
    expect(await labelNamesFor('task_labels', 'task_id', seeded[0]!.id)).toEqual(['锚点之后']);
  });

  test('falls back to the latest instance before the anchor when none is at or after it', async () => {
    const owner = await insertActor('rule-edit-fallback-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const today = currentCalendarDateIn('UTC');
    const tomorrow = addDays(today, 1);

    const recentLabelId = await createLabel(owner.accessToken, householdId, '最近一次');
    const oldestLabelId = await createLabel(owner.accessToken, householdId, '最早一次');

    // Weekly on TODAY's weekday only, starting a week ago: every row lands on
    // or before today, so nothing exists at or after tomorrow's anchor and
    // the fallback branch is the only way to find a source at all.
    const created = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: 'Rule with only past instances',
      recurrence: weeklyAcross([today], addDays(today, -7)),
    });
    expect(created.statusCode).toBe(201);
    const oldRuleId = (created.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    const instances = await instancesFor('tasks', oldRuleId);
    expect(instances.map((row) => row.day))
      .toEqual([formatIsoDate(addDays(today, -7)), formatIsoDate(today)]);
    await tagTask(owner.accessToken, householdId, instances[0]!.id, [oldestLabelId]);
    await tagTask(owner.accessToken, householdId, instances[1]!.id, [recentLabelId]);

    const response = await recurrenceRulesApi(
      owner.accessToken, householdId, 'PUT', `/${oldRuleId}`,
      { recurrence: dailyFrom(tomorrow) },
    );
    expect(response.statusCode).toBe(200);
    const newRuleId = (response.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    const seeded = await instancesFor('tasks', newRuleId);
    expect(seeded).toHaveLength(1);
    expect(await labelNamesFor('task_labels', 'task_id', seeded[0]!.id)).toEqual(['最近一次']);
  });

  test('inherits the remaining count and clears the old rule\'s count atomically', async () => {
    const owner = await insertActor('rule-edit-count-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const today = currentCalendarDateIn('UTC');
    const tomorrow = addDays(today, 1);

    const created = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: 'Count bounded rule',
      recurrence: weeklyAcross([today, tomorrow], addDays(today, -7), { count: 10 }),
    });
    expect(created.statusCode).toBe(201);
    const oldRuleId = (created.json() as { recurrenceRuleId: string }).recurrenceRuleId;
    // Premise: exactly three occurrences have already elapsed before the
    // anchor, so 10 - 3 = 7 remain for the successor to inherit.
    const elapsed = (await occurrenceDatesFor('tasks', oldRuleId))
      .filter((day) => day < formatIsoDate(tomorrow));
    expect(elapsed).toHaveLength(3);

    const response = await recurrenceRulesApi(
      owner.accessToken, householdId, 'PUT', `/${oldRuleId}`,
      { recurrence: dailyFrom(tomorrow) },
    );
    expect(response.statusCode).toBe(200);
    const newRuleId = (response.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    expect((await ruleRow(newRuleId)).count).toBe(7);
    // endsOn and count are mutually exclusive: date-bounding the old rule must
    // clear its count in the same statement, never leave both set.
    const oldBounds = await ruleBounds(oldRuleId);
    expect(oldBounds.count).toBeNull();
    expect(oldBounds.endsOn).toBe(formatIsoDate(today));
  });

  test('rejects endsOn and count together with 400 on recurrence.endsOn', async () => {
    const owner = await insertActor('rule-edit-xor-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const today = currentCalendarDateIn('UTC');
    const tomorrow = addDays(today, 1);

    const created = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: 'Rule with conflicting bounds requested',
      recurrence: weeklyAcross([today, tomorrow], today),
    });
    expect(created.statusCode).toBe(201);
    const oldRuleId = (created.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    const response = await recurrenceRulesApi(
      owner.accessToken, householdId, 'PUT', `/${oldRuleId}`,
      { recurrence: dailyFrom(tomorrow, { endsOn: formatIsoDate(addDays(today, 30)), count: 5 }) },
    );
    expect(response.statusCode).toBe(400);
    const error = response.json().error as { code: string; details: Array<{ field: string; codes: string[] }> };
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details[0]!.field).toBe('recurrence.endsOn');
    expect(error.details[0]!.codes).toContain('ends_on_and_count_mutually_exclusive');
    // A rejected request writes nothing at all.
    expect(await ruleBounds(oldRuleId)).toEqual({ endsOn: null, count: null });
  });

  test('rejects a successor that can never occur and leaves the old rule byte-identical', async () => {
    const owner = await insertActor('rule-edit-empty-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const today = currentCalendarDateIn('UTC');
    const tomorrow = addDays(today, 1);

    const created = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: 'Rule edited into nothing',
      recurrence: weeklyAcross([today, tomorrow], addDays(today, -7), { count: 10 }),
    });
    expect(created.statusCode).toBe(201);
    const oldRuleId = (created.json() as { recurrenceRuleId: string }).recurrenceRuleId;
    const boundsBefore = await ruleBounds(oldRuleId);
    const rowsBefore = await occurrenceDatesFor('tasks', oldRuleId);
    expect(boundsBefore).toEqual({ endsOn: null, count: 10 });

    // endsOn strictly before the anchor: the successor could never produce a
    // single occurrence.
    const response = await recurrenceRulesApi(
      owner.accessToken, householdId, 'PUT', `/${oldRuleId}`,
      { recurrence: dailyFrom(tomorrow, { endsOn: formatIsoDate(today) }) },
    );
    expect(response.statusCode).toBe(400);
    const error = response.json().error as { code: string; details: Array<{ field: string; codes: string[] }> };
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details[0]!.codes).toContain('no_occurrence_in_range');

    // The old rule was already date-bounded inside the transaction before this
    // rejection fired — D-08 requires the rollback to restore it exactly.
    expect(await ruleBounds(oldRuleId)).toEqual(boundsBefore);
    expect(await occurrenceDatesFor('tasks', oldRuleId)).toEqual(rowsBefore);
    expect(await ruleCountFor(householdId)).toBe(1);
  });

  test('rolls the whole split back when its last write fails mid-transaction', async () => {
    const owner = await insertActor('rule-edit-rollback-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const today = currentCalendarDateIn('UTC');
    const tomorrow = addDays(today, 1);
    const doomedTitle = 'SPLIT_SEED_MUST_FAIL';

    const created = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: doomedTitle,
      recurrence: weeklyAcross([today, tomorrow], addDays(today, -7), { count: 10 }),
    });
    expect(created.statusCode).toBe(201);
    const oldRuleId = (created.json() as { recurrenceRuleId: string }).recurrenceRuleId;
    const boundsBefore = await ruleBounds(oldRuleId);
    const rowsBefore = await occurrenceDatesFor('tasks', oldRuleId);
    expect(boundsBefore).toEqual({ endsOn: null, count: 10 });

    // Force the failure on the split's LAST write — the seed instance insert.
    // By then the old rule has been date-bounded, its count cleared, its
    // future rows deleted, and the successor rule created, so a passing
    // rollback assertion here proves every one of those is undone rather than
    // just the first statement. NOT VALID grandfathers the rows the fixture
    // already wrote, so the seed INSERT is the only statement that trips it.
    //
    // No production constraint can serve as this vector: every rule column
    // the request can influence is already range-checked by RecurrenceDto
    // before it reaches the database, and every template column the successor
    // copies is copied from a row that necessarily already satisfies it.
    await withDatabase((client) => client.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "tmp_split_seed_must_fail"
         CHECK ("title" <> '${doomedTitle}') NOT VALID`,
    ));
    try {
      const response = await recurrenceRulesApi(
        owner.accessToken, householdId, 'PUT', `/${oldRuleId}`,
        { recurrence: dailyFrom(tomorrow) },
      );
      expect(response.statusCode).toBeGreaterThanOrEqual(400);

      // D-08: no intermediate state survives — no half-ended old rule, no
      // orphaned successor, no missing occurrence rows.
      expect(await ruleBounds(oldRuleId)).toEqual(boundsBefore);
      expect(await occurrenceDatesFor('tasks', oldRuleId)).toEqual(rowsBefore);
      expect(await ruleCountFor(householdId)).toBe(1);
    } finally {
      // Unconditional: resetDatabase truncates rows and never touches DDL, so
      // a leaked constraint would poison every later test in the run.
      await withDatabase((client) => client.query(
        `ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tmp_split_seed_must_fail"`,
      ));
    }
  });

  test('returns 404 RECURRENCE_RULE_NOT_FOUND for a ruleId belonging to another household', async () => {
    const owner = await insertActor('rule-edit-cross-owner@example.test');
    const otherOwner = await insertActor('rule-edit-cross-other@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const otherHouseholdId = await createHousehold(otherOwner.accessToken);
    const today = currentCalendarDateIn('UTC');
    const tomorrow = addDays(today, 1);

    const created = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: 'Rule of another household',
      recurrence: weeklyAcross([today, tomorrow], today),
    });
    expect(created.statusCode).toBe(201);
    const oldRuleId = (created.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    const response = await recurrenceRulesApi(
      otherOwner.accessToken, otherHouseholdId, 'PUT', `/${oldRuleId}`,
      { recurrence: dailyFrom(tomorrow) },
    );
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('RECURRENCE_RULE_NOT_FOUND');
    expect((await ruleBounds(oldRuleId)).endsOn).toBeNull();
  });

  test('returns 404 HOUSEHOLD_NOT_FOUND for a non-member before any rule lookup', async () => {
    const owner = await insertActor('rule-edit-outsider-owner@example.test');
    const outsider = await insertActor('rule-edit-outsider@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const today = currentCalendarDateIn('UTC');
    const tomorrow = addDays(today, 1);

    const created = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: 'Member gated rule',
      recurrence: weeklyAcross([today, tomorrow], today),
    });
    expect(created.statusCode).toBe(201);
    const oldRuleId = (created.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    const response = await recurrenceRulesApi(
      outsider.accessToken, householdId, 'PUT', `/${oldRuleId}`,
      { recurrence: dailyFrom(tomorrow) },
    );
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('HOUSEHOLD_NOT_FOUND');
    expect((await ruleBounds(oldRuleId)).endsOn).toBeNull();
  });

  test('rejects a member editing another member\'s rule with 403, but allows their own', async () => {
    const owner = await insertActor('rule-edit-member-owner@example.test');
    const member = await insertActor('rule-edit-member-other@example.test');
    const householdId = await createHousehold(owner.accessToken);
    await addMemberViaDb(householdId, member);
    const today = currentCalendarDateIn('UTC');
    const tomorrow = addDays(today, 1);

    const ownersRule = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: "Owner's rule",
      recurrence: weeklyAcross([today, tomorrow], today),
    });
    expect(ownersRule.statusCode).toBe(201);
    const ownersRuleId = (ownersRule.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    const forbidden = await recurrenceRulesApi(
      member.accessToken, householdId, 'PUT', `/${ownersRuleId}`,
      { recurrence: dailyFrom(tomorrow) },
    );
    // 403, not 404: the member can legitimately SEE this rule through the list
    // endpoint, so hiding its existence here would contradict that.
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().error.code).toBe('FORBIDDEN');
    expect((await ruleBounds(ownersRuleId)).endsOn).toBeNull();

    const ownRule = await taskApi(member.accessToken, householdId, 'POST', '', {
      title: "Member's own rule",
      recurrence: weeklyAcross([today, tomorrow], today),
    });
    expect(ownRule.statusCode).toBe(201);
    const ownRuleId = (ownRule.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    const allowed = await recurrenceRulesApi(
      member.accessToken, householdId, 'PUT', `/${ownRuleId}`,
      { recurrence: dailyFrom(tomorrow) },
    );
    expect(allowed.statusCode).toBe(200);
    const newRuleId = (allowed.json() as { recurrenceRuleId: string }).recurrenceRuleId;
    expect(newRuleId).not.toBe(ownRuleId);
  });

  test('applies identically to an event rule and seeds it with the successor duration', async () => {
    const owner = await insertActor('rule-edit-event-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const today = currentCalendarDateIn('UTC');
    const yesterday = addDays(today, -1);
    const tomorrow = addDays(today, 1);
    const yesterdayIso = formatIsoDate(yesterday);

    const created = await eventApi(owner.accessToken, householdId, 'POST', '', {
      title: 'Event rule edited from the rule',
      startTime: `${yesterdayIso}T09:00:00.000Z`,
      endTime: `${yesterdayIso}T10:00:00.000Z`,
      recurrence: weeklyAcross([yesterday, today, tomorrow], yesterday),
    });
    expect(created.statusCode).toBe(201);
    const oldRuleId = (created.json() as { recurrenceRuleId: string }).recurrenceRuleId;
    const before = await occurrenceDatesFor('events', oldRuleId);
    expect(before).toContain(formatIsoDate(tomorrow));

    const response = await recurrenceRulesApi(
      owner.accessToken, householdId, 'PUT', `/${oldRuleId}`,
      { recurrence: dailyFrom(tomorrow) },
    );
    expect(response.statusCode).toBe(200);
    const newRuleId = (response.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    expect(await occurrenceDatesFor('events', oldRuleId))
      .toEqual([yesterdayIso, formatIsoDate(today)]);
    expect((await ruleBounds(oldRuleId)).endsOn).toBe(formatIsoDate(today));
    expect(await occurrenceDatesFor('events', newRuleId)).toEqual([formatIsoDate(tomorrow)]);

    // The seed event's span must come from the successor rule's
    // duration_minutes, not from any surviving instance's own times.
    const successor = await ruleRow(newRuleId);
    expect(successor.durationMinutes).toBe(60);
    const seed = await withDatabase((client) => client.query(
      `SELECT "start_time", "end_time" FROM "events" WHERE "recurrence_rule_id" = $1`,
      [newRuleId],
    ));
    const seedRow = seed.rows[0] as { start_time: Date; end_time: Date };
    expect(seedRow.end_time.getTime() - seedRow.start_time.getTime())
      .toBe(successor.durationMinutes! * 60_000);
  });

  test('lists the successor before the superseded rule after an edit', async () => {
    const owner = await insertActor('rule-edit-list-owner@example.test');
    const householdId = await createHousehold(owner.accessToken);
    const today = currentCalendarDateIn('UTC');
    const tomorrow = addDays(today, 1);

    // Occurrences strictly after today only, so once the rule is superseded
    // nothing of it survives on or after today and its nextOccurrenceDate is
    // genuinely null rather than null-by-accident.
    const created = await taskApi(owner.accessToken, householdId, 'POST', '', {
      title: 'Superseded rule',
      recurrence: weeklyAcross([tomorrow], tomorrow),
    });
    expect(created.statusCode).toBe(201);
    const oldRuleId = (created.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    const response = await recurrenceRulesApi(
      owner.accessToken, householdId, 'PUT', `/${oldRuleId}`,
      { recurrence: dailyFrom(tomorrow) },
    );
    expect(response.statusCode).toBe(200);
    const newRuleId = (response.json() as { recurrenceRuleId: string }).recurrenceRuleId;

    const listed = await recurrenceRulesApi(owner.accessToken, householdId, 'GET');
    expect(listed.statusCode).toBe(200);
    const body = listed.json() as { rules: RuleListItem[]; total: number };
    expect(body.total).toBe(2);
    // The superseded rule stays visible — an edit supersedes, it does not
    // delete — but it can never occur again.
    const oldItem = body.rules.find((rule) => rule.id === oldRuleId);
    const newItem = body.rules.find((rule) => rule.id === newRuleId);
    expect(oldItem?.nextOccurrenceDate).toBeNull();
    expect(newItem?.nextOccurrenceDate).toBe(formatIsoDate(tomorrow));
    expect(body.rules.findIndex((rule) => rule.id === newRuleId))
      .toBeLessThan(body.rules.findIndex((rule) => rule.id === oldRuleId));
  });
});
