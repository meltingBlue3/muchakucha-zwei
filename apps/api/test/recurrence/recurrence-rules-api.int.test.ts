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
  method: 'GET' | 'POST',
  path: string = '',
): Promise<InjectResponse> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (app.getHttpAdapter().getInstance() as any).inject({
    method,
    url: `/api/v1/households/${encodeURIComponent(householdId)}/recurrence-rules${path}`,
    headers: { authorization: `Bearer ${accessToken}` },
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
