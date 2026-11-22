import { fixtureEditPayload } from '../../../../scripts/test-edit-version.js';
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApplication } from '../../src/main.js';
import { addDays, currentCalendarDateIn, formatIsoDate } from '../../src/modules/recurrence/recurrence-date.js';
import { RecurrenceMaterializerService } from '../../src/modules/recurrence/recurrence-materializer.service.js';
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
  accessToken: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  payload?: unknown,
): Promise<ApiResponse> {
  payload = await fixtureEditPayload(method, `/api/v1${url}`, payload, async (readUrl) => {
    const snapshot = await app.getHttpAdapter().getInstance().inject({ method: 'GET', url: readUrl, headers: { authorization: `Bearer ${accessToken}` } });
    return snapshot.json();
  });
  return (app.getHttpAdapter().getInstance() as any).inject({
    method,
    url: `/api/v1${url}`,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload !== undefined ? { payload } : {}),
  });
}

async function createHousehold(accessToken: string, name: string): Promise<string> {
  const response = await request(accessToken, 'POST', '/households', { name });
  expect(response.statusCode).toBe(201);
  return (response.json() as { id: string }).id;
}

async function addMemberViaDb(householdId: string, actor: ActorFixture, role: 'ADMIN' | 'MEMBER'): Promise<void> {
  await withDatabase(async (client) => {
    await client.query(
      `INSERT INTO "memberships" ("user_id", "household_id", "role") VALUES ($1, $2, $3)`,
      [actor.userId, householdId, role],
    );
  });
}

beforeAll(async () => {
  passwordHash = await argon2.hash('labels-fixture-password', {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  app = await createApplication({
    ...process.env,
    NODE_ENV: 'test',
    JWT_ACCESS_SECRET: accessSecret,
    // Each case issues many requests; the global throttle is covered elsewhere.
    E2E_DISABLE_RATE_LIMITS: 'true',
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

function householdApi(
  actor: ActorFixture,
  householdId: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  payload?: unknown,
): Promise<ApiResponse> {
  return request(actor.accessToken, method, `/households/${encodeURIComponent(householdId)}${path}`, payload);
}

async function createLabel(actor: ActorFixture, householdId: string, name: string, color = '#EF4444'): Promise<string> {
  const response = await householdApi(actor, householdId, 'POST', '/labels', { name, color });
  expect(response.statusCode).toBe(201);
  return (response.json() as { id: string }).id;
}

function taskBody(title: string): Record<string, unknown> {
  return { title };
}

function eventBody(title: string): Record<string, unknown> {
  const start = new Date(Date.now() + 86_400_000);
  const end = new Date(start.getTime() + 3_600_000);
  return { title, startTime: start.toISOString(), endTime: end.toISOString() };
}

async function createTask(actor: ActorFixture, householdId: string, title: string, labelIds?: string[]): Promise<string> {
  const response = await householdApi(actor, householdId, 'POST', '/tasks', { ...taskBody(title), ...(labelIds ? { labelIds } : {}) });
  expect(response.statusCode).toBe(201);
  return (response.json() as { id: string }).id;
}

async function createEvent(actor: ActorFixture, householdId: string, title: string, labelIds?: string[]): Promise<string> {
  const response = await householdApi(actor, householdId, 'POST', '/events', { ...eventBody(title), ...(labelIds ? { labelIds } : {}) });
  expect(response.statusCode).toBe(201);
  return (response.json() as { id: string }).id;
}

async function labelNamesOf(actor: ActorFixture, householdId: string, path: string): Promise<string[]> {
  const response = await householdApi(actor, householdId, 'GET', path);
  expect(response.statusCode).toBe(200);
  return (response.json().labels as Array<{ name: string }>).map((label) => label.name).sort();
}

describe('labels API contract', () => {
  let owner: ActorFixture;
  let admin: ActorFixture;
  let member: ActorFixture;
  let outsider: ActorFixture;
  let householdId: string;

  beforeEach(async () => {
    [owner, admin, member, outsider] = await Promise.all([
      insertActor('owner-labels', '标签主人'),
      insertActor('admin-labels', '标签管理员'),
      insertActor('member-labels', '标签成员'),
      insertActor('outsider-labels', '无关人员'),
    ]);
    householdId = await createHousehold(owner.accessToken, '标签组');
    await addMemberViaDb(householdId, admin, 'ADMIN');
    await addMemberViaDb(householdId, member, 'MEMBER');
  });

  test('malformed path ids are rejected with 400 rather than a driver-level 500', async () => {
    const labelId = await createLabel(owner, householdId, '路径检查');
    const cases: Array<[method: 'PUT' | 'DELETE', path: string, payload?: unknown]> = [
      ['PUT', '/households/not-a-uuid/labels/' + labelId, { name: '不应保存' }],
      ['PUT', `/households/${householdId}/labels/not-a-uuid`, { name: '不应保存' }],
      ['DELETE', `/households/${householdId}/labels/not-a-uuid`],
    ];
    for (const [method, path, payload] of cases) {
      const response = await request(owner.accessToken, method, path, payload);
      expect({ method, path, status: response.statusCode }).toEqual({ method, path, status: 400 });
    }
    expect(await labelNamesOf(owner, householdId, '/labels')).toEqual(['路径检查']);
  });

  describe('labels chosen while creating content', () => {
    // A new series generates its first week inside the request that saves it,
    // so labels chosen on the form have to arrive with that same request.
    const everyDay = [0, 1, 2, 3, 4, 5, 6];
    const firstWeek = () => {
      const today = currentCalendarDateIn('UTC');
      return Array.from({ length: 7 }, (_, offset) => formatIsoDate(addDays(today, offset)));
    };

    test('a new weekly event series carries its labels on every occurrence saved with it', async () => {
      const labelId = await createLabel(owner, householdId, '运动');
      const week = firstWeek();
      const created = await householdApi(member, householdId, 'POST', '/events', {
        title: '健身',
        startTime: `${week[0]}T10:00:00.000Z`,
        endTime: `${week[0]}T11:00:00.000Z`,
        recurrence: { freq: 'weekly', byWeekday: everyDay, startsOn: week[0], timezone: 'UTC' },
        labelIds: [labelId],
      });
      expect(created.statusCode).toBe(201);

      const listed = await householdApi(member, householdId, 'GET', `/events?startDate=${week[0]}&endDate=${week[6]}`);
      expect(listed.statusCode).toBe(200);
      const series = (listed.json().events as Array<{ recurrenceRuleId: string | null; occurrenceDate: string; labels: Array<{ name: string }> }>)
        .filter((event) => event.recurrenceRuleId === created.json().recurrenceRuleId);
      expect(series.map((event) => ({ date: event.occurrenceDate, labels: event.labels.map((label) => label.name) })))
        .toEqual(week.map((date) => ({ date, labels: ['运动'] })));
    });

    test('a new weekly task series carries its labels on every occurrence saved with it', async () => {
      const labelId = await createLabel(owner, householdId, '家务');
      const week = firstWeek();
      const created = await householdApi(member, householdId, 'POST', '/tasks', {
        title: '倒垃圾',
        recurrence: { freq: 'weekly', byWeekday: everyDay, startsOn: week[0], timezone: 'UTC' },
        labelIds: [labelId],
      });
      expect(created.statusCode).toBe(201);

      const listed = await householdApi(member, householdId, 'GET', '/tasks');
      expect(listed.statusCode).toBe(200);
      const series = (listed.json().tasks as Array<{ recurrenceRuleId: string | null; occurrenceDate: string; labels: Array<{ name: string }> }>)
        .filter((task) => task.recurrenceRuleId === created.json().recurrenceRuleId)
        .sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate));
      expect(series.map((task) => ({ date: task.occurrenceDate, labels: task.labels.map((label) => label.name) })))
        .toEqual(week.map((date) => ({ date, labels: ['家务'] })));
    });

    test('a label from another household refuses the whole create and saves nothing', async () => {
      const otherHouseholdId = await createHousehold(outsider.accessToken, '别人家');
      const foreignLabelId = await createLabel(outsider, otherHouseholdId, '别人的标签');
      const week = firstWeek();
      const attempts: Array<[path: '/tasks' | '/events', payload: Record<string, unknown>]> = [
        ['/tasks', { title: '一次性任务', labelIds: [foreignLabelId] }],
        ['/events', {
          title: '重复日程',
          startTime: `${week[0]}T10:00:00.000Z`,
          endTime: `${week[0]}T11:00:00.000Z`,
          recurrence: { freq: 'weekly', byWeekday: everyDay, startsOn: week[0], timezone: 'UTC' },
          labelIds: [foreignLabelId],
        }],
      ];
      for (const [path, payload] of attempts) {
        const response = await householdApi(member, householdId, 'POST', path, payload);
        expect({ path, status: response.statusCode, field: response.json().error?.details?.[0]?.field })
          .toEqual({ path, status: 400, field: 'labelIds' });
      }
      expect((await householdApi(member, householdId, 'GET', '/tasks')).json().total).toBe(0);
      expect((await householdApi(member, householdId, 'GET', '/events')).json().total).toBe(0);
      expect((await householdApi(member, householdId, 'GET', '/recurrence-rules')).json().total).toBe(0);
    });
  });

  describe('series labels', () => {
    // Generated occurrences take their labels from the series, as they take
    // their title; relabelling one occurrence stays on that occurrence.
    const todayInUtc = () => currentCalendarDateIn('UTC');
    const weekdayOf = (date: ReturnType<typeof todayInUtc>) => new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
    type Row = { recurrenceRuleId: string | null; occurrenceDate: string; labels: Array<{ name: string }> };
    const seriesRows = (rows: Row[], ruleId: string) => rows
      .filter((row) => row.recurrenceRuleId === ruleId)
      .sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate))
      .map((row) => ({ date: row.occurrenceDate, labels: row.labels.map((label) => label.name) }));

    test.each(['events', 'tasks'] as const)('turning a one-time item in %s into a weekly series labels every occurrence', async (collection) => {
      const labelId = await createLabel(owner, householdId, '运动');
      const today = todayInUtc();
      const week = Array.from({ length: 7 }, (_, offset) => formatIsoDate(addDays(today, offset)));
      const once = collection === 'events'
        ? { title: '健身', startTime: `${week[0]}T10:00:00.000Z`, endTime: `${week[0]}T11:00:00.000Z`, labelIds: [labelId] }
        : { title: '倒垃圾', labelIds: [labelId] };
      const created = await householdApi(owner, householdId, 'POST', `/${collection}`, once);
      expect(created.statusCode).toBe(201);

      const converted = await householdApi(owner, householdId, 'PUT', `/${collection}/${created.json().id}`, {
        recurrence: { freq: 'weekly', byWeekday: [0, 1, 2, 3, 4, 5, 6], startsOn: week[0], timezone: 'UTC' },
      });
      expect(converted.statusCode).toBe(200);

      const listed = await householdApi(owner, householdId, 'GET', collection === 'events' ? `/events?startDate=${week[0]}&endDate=${week[6]}` : '/tasks');
      expect(seriesRows(listed.json()[collection], converted.json().recurrenceRuleId)).toEqual(
        week.map((date) => ({ date, labels: ['运动'] })),
      );
    });

    test('relabelling the first occurrence of an event series leaves later occurrences alone', async () => {
      const seriesLabel = await createLabel(owner, householdId, '系列');
      const onceLabel = await createLabel(owner, householdId, '仅此次');
      const today = todayInUtc();
      const first = formatIsoDate(today);
      const created = await householdApi(owner, householdId, 'POST', '/events', {
        title: '周会',
        startTime: `${first}T10:00:00.000Z`,
        endTime: `${first}T11:00:00.000Z`,
        recurrence: { freq: 'weekly', byWeekday: [weekdayOf(today)], startsOn: first, timezone: 'UTC' },
        labelIds: [seriesLabel],
      });
      expect(created.statusCode).toBe(201);
      expect((await householdApi(owner, householdId, 'PUT', `/events/${created.json().id}`, { labelIds: [onceLabel] })).statusCode).toBe(200);

      const last = formatIsoDate(addDays(today, 14));
      const listed = await householdApi(owner, householdId, 'GET', `/events?expandRecurring=true&startDate=${first}&endDate=${last}`);
      expect(listed.statusCode).toBe(200);
      expect(seriesRows(listed.json().events, created.json().recurrenceRuleId)).toEqual([
        { date: first, labels: ['仅此次'] },
        { date: formatIsoDate(addDays(today, 7)), labels: ['系列'] },
        { date: last, labels: ['系列'] },
      ]);
    });

    test('relabelling the first occurrence of a task series leaves the next generated occurrence alone', async () => {
      const seriesLabel = await createLabel(owner, householdId, '系列');
      const onceLabel = await createLabel(owner, householdId, '仅此次');
      const today = todayInUtc();
      const first = formatIsoDate(addDays(today, -7));
      const created = await householdApi(owner, householdId, 'POST', '/tasks', {
        title: '倒垃圾',
        recurrence: { freq: 'weekly', byWeekday: [weekdayOf(today)], startsOn: first, timezone: 'UTC' },
        labelIds: [seriesLabel],
      });
      expect(created.statusCode).toBe(201);
      const ruleId = created.json().recurrenceRuleId as string;
      expect((await householdApi(owner, householdId, 'PUT', `/tasks/${created.json().id}`, { labelIds: [onceLabel] })).statusCode).toBe(200);

      // The scheduler's next run, a week on: today's row is written after the edit.
      await withDatabase(async (client) => {
        await client.query(`DELETE FROM "tasks" WHERE "recurrence_rule_id" = $1 AND "occurrence_date" = $2::date`, [ruleId, formatIsoDate(today)]);
        await client.query(`UPDATE "recurrence_rules" SET "materialized_through" = $2::date WHERE "id" = $1`, [ruleId, first]);
      });
      await app.get(RecurrenceMaterializerService).materializeRule(ruleId);

      const listed = await householdApi(owner, householdId, 'GET', '/tasks');
      expect(seriesRows(listed.json().tasks, ruleId)).toEqual([
        { date: first, labels: ['仅此次'] },
        { date: formatIsoDate(today), labels: ['系列'] },
      ]);
    });
  });

  describe('label management', () => {
    // Shown beside each label and before deleting one. A recurring series is
    // one thing to the family, however many occurrences it has generated.
    test('the list says how many events and tasks use each label, a series once', async () => {
      const used = await createLabel(owner, householdId, '常用');
      await createLabel(owner, householdId, '没用过');
      await createEvent(owner, householdId, '一次性日程', [used]);
      await createTask(owner, householdId, '任务一', [used]);
      await createTask(owner, householdId, '任务二', [used]);
      const today = formatIsoDate(currentCalendarDateIn('UTC'));
      const series = await householdApi(owner, householdId, 'POST', '/events', {
        title: '每天的日程',
        startTime: `${today}T10:00:00.000Z`,
        endTime: `${today}T11:00:00.000Z`,
        recurrence: { freq: 'weekly', byWeekday: [0, 1, 2, 3, 4, 5, 6], startsOn: today, timezone: 'UTC' },
        labelIds: [used],
      });
      expect(series.statusCode).toBe(201);

      const labels = (await householdApi(member, householdId, 'GET', '/labels')).json().labels as Array<{ name: string; usage: unknown }>;

      expect(labels.find((label) => label.name === '常用')!.usage).toEqual({ events: 2, tasks: 2 });
      expect(labels.find((label) => label.name === '没用过')!.usage).toEqual({ events: 0, tasks: 0 });
    });

    test('creates a label with a trimmed name', async () => {
      const response = await householdApi(admin, householdId, 'POST', '/labels', { name: '学校 ', color: '#3B82F6' });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body).toMatchObject({ householdId, name: '学校', color: '#3B82F6', createdBy: admin.userId });
      expect(Date.parse(body.createdAt)).not.toBeNaN();
    });

    test.each([
      ['missing name', { color: '#EF4444' }],
      ['empty name', { name: '', color: '#EF4444' }],
      ['leading whitespace', { name: ' 学校', color: '#EF4444' }],
      ['name over 40 characters', { name: 'a'.repeat(41), color: '#EF4444' }],
      ['missing color', { name: '学校' }],
      ['short hex color', { name: '学校', color: '#FFF' }],
      ['named color', { name: '学校', color: 'red' }],
    ])('rejects %s', async (_name, payload) => {
      const response = await householdApi(owner, householdId, 'POST', '/labels', payload);

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_FAILED');
    });

    test('rejects duplicate names within a household but allows them across households', async () => {
      await createLabel(owner, householdId, '医疗');

      const duplicate = await householdApi(owner, householdId, 'POST', '/labels', { name: '医疗', color: '#10B981' });
      expect(duplicate.statusCode).toBe(400);
      expect(duplicate.json().error.code).toBe('VALIDATION_FAILED');

      const otherHouseholdId = await createHousehold(outsider.accessToken, '别人的家');
      const elsewhere = await householdApi(outsider, otherHouseholdId, 'POST', '/labels', { name: '医疗', color: '#10B981' });
      expect(elsewhere.statusCode).toBe(201);
    });

    test('answers simultaneous duplicate names with the duplicate error rather than a 500', async () => {
      const created = await Promise.all(Array.from({ length: 5 }, () =>
        householdApi(owner, householdId, 'POST', '/labels', { name: '同时', color: '#10B981' })));
      expect(created.map(response => response.statusCode).sort()).toEqual([201, 400, 400, 400, 400]);
      for (const response of created.filter(r => r.statusCode === 400)) {
        expect(response.json().error.details).toEqual([expect.objectContaining({ field: 'name', codes: ['duplicate'] })]);
      }

      const labelIds = await Promise.all(['甲', '乙', '丙'].map(name => createLabel(owner, householdId, name)));
      const renamed = await Promise.all(labelIds.map(labelId =>
        householdApi(owner, householdId, 'PUT', `/labels/${labelId}`, { name: '改名' })));
      expect(renamed.map(response => response.statusCode).sort()).toEqual([200, 400, 400]);
      for (const response of renamed.filter(r => r.statusCode === 400)) {
        expect(response.json().error.details).toEqual([expect.objectContaining({ field: 'name', codes: ['duplicate'] })]);
      }
    });

    test('lists household labels by name for every member', async () => {
      await createLabel(owner, householdId, 'b-运动');
      await createLabel(owner, householdId, 'a-学校');
      const otherHouseholdId = await createHousehold(outsider.accessToken, '别人的家');
      await createLabel(outsider, otherHouseholdId, 'c-别人');

      const response = await householdApi(member, householdId, 'GET', '/labels');

      expect(response.statusCode).toBe(200);
      expect(response.json().total).toBe(2);
      expect(response.json().labels.map((label: { name: string }) => label.name)).toEqual(['a-学校', 'b-运动']);
    });

    test('a delete sent with the name and colour it was confirmed on fails once the label has changed', async () => {
      const labelId = await createLabel(owner, householdId, '旧名');
      expect((await householdApi(admin, householdId, 'PUT', `/labels/${labelId}`, { name: '新名' })).statusCode).toBe(200);
      const version = (name: string) => `expectedName=${encodeURIComponent(name)}&expectedColor=${encodeURIComponent('#EF4444')}`;

      const stale = await householdApi(owner, householdId, 'DELETE', `/labels/${labelId}?${version('旧名')}`);
      expect(stale.statusCode).toBe(409);
      expect(stale.json().error.code).toBe('EDIT_CONFLICT');

      const half = await householdApi(owner, householdId, 'DELETE', `/labels/${labelId}?expectedName=${encodeURIComponent('新名')}`);
      expect(half.statusCode).toBe(400);
      expect(half.json().error.details).toEqual([expect.objectContaining({ field: 'expectedColor' })]);

      const current = await householdApi(owner, householdId, 'DELETE', `/labels/${labelId}?${version('新名')}`);
      expect(current.statusCode).toBe(204);
    });

    test('an edit sent with the name and colour it was read with fails once the label has changed', async () => {
      const labelId = await createLabel(owner, householdId, '旧名');
      expect((await householdApi(admin, householdId, 'PUT', `/labels/${labelId}`, { color: '#2C716C' })).statusCode).toBe(200);

      const stale = await householdApi(owner, householdId, 'PUT', `/labels/${labelId}`, { name: '覆盖', expectedName: '旧名', expectedColor: '#EF4444' });
      expect(stale.statusCode).toBe(409);
      expect(stale.json().error.code).toBe('EDIT_CONFLICT');
      expect((await householdApi(owner, householdId, 'GET', '/labels')).json().labels)
        .toEqual([expect.objectContaining({ name: '旧名', color: '#2C716C' })]);

      const half = await householdApi(owner, householdId, 'PUT', `/labels/${labelId}`, { name: '覆盖', expectedName: '旧名' });
      expect(half.statusCode).toBe(400);
      expect(half.json().error.details).toEqual([expect.objectContaining({ field: 'expectedColor' })]);

      const current = await householdApi(owner, householdId, 'PUT', `/labels/${labelId}`, { name: '覆盖', expectedName: '旧名', expectedColor: '#2C716C' });
      expect(current.statusCode).toBe(200);
      expect(await labelNamesOf(owner, householdId, '/labels')).toEqual(['覆盖']);
    });

    test('updates name and color independently', async () => {
      const labelId = await createLabel(owner, householdId, '旧名');

      const renamed = await householdApi(admin, householdId, 'PUT', `/labels/${labelId}`, { name: '新名' });
      expect(renamed.statusCode).toBe(200);
      expect(renamed.json()).toMatchObject({ name: '新名', color: '#EF4444' });

      const recolored = await householdApi(admin, householdId, 'PUT', `/labels/${labelId}`, { color: '#8B5CF6' });
      expect(recolored.statusCode).toBe(200);
      expect(recolored.json()).toMatchObject({ name: '新名', color: '#8B5CF6' });
    });

    test('update allows keeping the same name but rejects taking another label name', async () => {
      const firstId = await createLabel(owner, householdId, '第一');
      await createLabel(owner, householdId, '第二');

      const sameName = await householdApi(owner, householdId, 'PUT', `/labels/${firstId}`, { name: '第一', color: '#06B6D4' });
      expect(sameName.statusCode).toBe(200);

      const conflict = await householdApi(owner, householdId, 'PUT', `/labels/${firstId}`, { name: '第二' });
      expect(conflict.statusCode).toBe(400);
      expect(conflict.json().error.code).toBe('VALIDATION_FAILED');

      const badColor = await householdApi(owner, householdId, 'PUT', `/labels/${firstId}`, { color: 'blue' });
      expect(badColor.statusCode).toBe(400);
    });

    test('deleting a label detaches it from tagged tasks and events', async () => {
      const labelId = await createLabel(owner, householdId, '临时');
      const keepId = await createLabel(owner, householdId, '保留');
      const taskId = await createTask(owner, householdId, '带标签的任务', [labelId, keepId]);
      const eventId = await createEvent(owner, householdId, '带标签的活动', [labelId, keepId]);

      const response = await householdApi(owner, householdId, 'DELETE', `/labels/${labelId}`);

      expect(response.statusCode).toBe(204);
      expect(await labelNamesOf(owner, householdId, `/tasks/${taskId}`)).toEqual(['保留']);
      expect(await labelNamesOf(owner, householdId, `/events/${eventId}`)).toEqual(['保留']);
      expect((await householdApi(owner, householdId, 'GET', '/labels')).json().total).toBe(1);
    });

    test('members can list labels but cannot create, update, or delete them', async () => {
      const labelId = await createLabel(owner, householdId, '只读');

      const responses = await Promise.all([
        householdApi(member, householdId, 'POST', '/labels', { name: '成员标签', color: '#EF4444' }),
        householdApi(member, householdId, 'PUT', `/labels/${labelId}`, { name: '改名' }),
        householdApi(member, householdId, 'DELETE', `/labels/${labelId}`),
      ]);

      for (const response of responses) {
        expect(response.statusCode).toBe(403);
        expect(response.json().error.code).toBe('FORBIDDEN');
      }
      expect(await labelNamesOf(member, householdId, '/labels')).toEqual(['只读']);
    });

    test('non-members get HOUSEHOLD_NOT_FOUND', async () => {
      const labelId = await createLabel(owner, householdId, '私有');

      const responses = await Promise.all([
        householdApi(outsider, householdId, 'GET', '/labels'),
        householdApi(outsider, householdId, 'POST', '/labels', { name: '闯入', color: '#EF4444' }),
        householdApi(outsider, householdId, 'PUT', `/labels/${labelId}`, { name: '闯入' }),
        householdApi(outsider, householdId, 'DELETE', `/labels/${labelId}`),
      ]);

      for (const response of responses) {
        expect(response.statusCode).toBe(404);
        expect(response.json().error.code).toBe('HOUSEHOLD_NOT_FOUND');
      }
    });

    test('a label cannot be changed through another household', async () => {
      const labelId = await createLabel(owner, householdId, '跨家');
      const otherHouseholdId = await createHousehold(owner.accessToken, '第二个家');

      const update = await householdApi(owner, otherHouseholdId, 'PUT', `/labels/${labelId}`, { name: '越界' });
      const remove = await householdApi(owner, otherHouseholdId, 'DELETE', `/labels/${labelId}`);

      expect(update.statusCode).toBe(404);
      expect(update.json().error.code).toBe('LABEL_NOT_FOUND');
      expect(remove.statusCode).toBe(404);
      expect(remove.json().error.code).toBe('LABEL_NOT_FOUND');
      expect(await labelNamesOf(owner, householdId, '/labels')).toEqual(['跨家']);
    });
  });

  // Labels reach an item only through its create and edit requests.
  describe.each([
    ['tasks', createTask, taskBody],
    ['events', createEvent, eventBody],
  ] as const)('labelling %s', (collection, createEntity, body) => {
    let schoolId: string;
    let sportId: string;
    let medicalId: string;

    beforeEach(async () => {
      schoolId = await createLabel(owner, householdId, '学校', '#3B82F6');
      sportId = await createLabel(owner, householdId, '运动', '#10B981');
      medicalId = await createLabel(owner, householdId, '医疗', '#EF4444');
    });

    test('members label on create, and an edit replaces or clears the set', async () => {
      const entityId = await createEntity(member, householdId, '要打标签', [schoolId, sportId]);
      const path = `/${collection}/${entityId}`;

      const tagged = await householdApi(member, householdId, 'GET', path);
      expect(tagged.json().labels).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: schoolId, name: '学校', color: '#3B82F6', householdId }),
          expect.objectContaining({ id: sportId, name: '运动', color: '#10B981' }),
        ]),
      );
      expect(tagged.json().labels).toHaveLength(2);

      const replaced = await householdApi(member, householdId, 'PUT', path, { labelIds: [sportId, medicalId] });
      expect(replaced.statusCode).toBe(200);
      expect(await labelNamesOf(member, householdId, path)).toEqual(['医疗', '运动']);

      const cleared = await householdApi(member, householdId, 'PUT', path, { labelIds: [] });
      expect(cleared.statusCode).toBe(200);
      expect(await labelNamesOf(member, householdId, path)).toEqual([]);
    });

    // The calendar colours an item by its first label, so that order has to be
    // one the family can predict: the household list's, not the click order.
    test('an item lists its labels in the household order, whatever order they were chosen in', async () => {
      const entityId = await createEntity(owner, householdId, '多个标签', [sportId, medicalId, schoolId]);

      const household = (await householdApi(owner, householdId, 'GET', '/labels')).json().labels as Array<{ id: string }>;
      const item = (await householdApi(owner, householdId, 'GET', `/${collection}/${entityId}`)).json().labels as Array<{ id: string }>;
      const listed = (await householdApi(owner, householdId, 'GET', `/${collection}`)).json()[collection] as Array<{ id: string; labels: Array<{ id: string }> }>;

      const order = household.map((label) => label.id);
      expect(item.map((label) => label.id)).toEqual(order);
      expect(listed.find((row) => row.id === entityId)!.labels.map((label) => label.id)).toEqual(order);
    });

    test('a label id sent twice is stored once', async () => {
      const entityId = await createEntity(owner, householdId, '重复打标签', [schoolId, schoolId]);

      expect(await labelNamesOf(owner, householdId, `/${collection}/${entityId}`)).toEqual(['学校']);
    });

    test('an edit with a label from another household keeps the existing labels', async () => {
      const entityId = await createEntity(owner, householdId, '混入外部标签', [schoolId]);
      const path = `/${collection}/${entityId}`;
      const otherHouseholdId = await createHousehold(outsider.accessToken, '别人的家');
      const foreignLabelId = await createLabel(outsider, otherHouseholdId, '外部');

      const response = await householdApi(owner, householdId, 'PUT', path, { labelIds: [sportId, foreignLabelId] });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_FAILED');
      expect(await labelNamesOf(owner, householdId, path)).toEqual(['学校']);
    });

    test('a create with unknown, malformed, or non-array label ids is refused and saves nothing', async () => {
      const attempts = [[randomUUID()], ['not-a-uuid'], schoolId];
      for (const labelIds of attempts) {
        const response = await householdApi(owner, householdId, 'POST', `/${collection}`, { ...body('无效标签'), labelIds });
        expect({ labelIds, status: response.statusCode, code: response.json().error?.code })
          .toEqual({ labelIds, status: 400, code: 'VALIDATION_FAILED' });
      }
      expect((await householdApi(owner, householdId, 'GET', `/${collection}`)).json().total).toBe(0);
    });
  });
});
