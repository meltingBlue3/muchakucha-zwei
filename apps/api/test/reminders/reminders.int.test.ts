import { fixtureEditPayload } from '../../../../scripts/test-edit-version.js';
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApplication } from '../../src/main.js';
import { addDays, currentCalendarDateIn, formatIsoDate, localDateTimeToInstant } from '../../src/modules/recurrence/recurrence-date.js';
import { getTestDatabaseUrl, resetDatabase } from '../reset-database.js';

const accessSecret = 'test-only-access-secret-that-is-longer-than-thirty-two-bytes';
const jwt = new JwtService({ secret: accessSecret, signOptions: { algorithm: 'HS256', expiresIn: 15 * 60 } });
const SHANGHAI = 'Asia/Shanghai';
const HOUR = 3_600_000;

let app: NestFastifyApplication;
let passwordHash: string;

interface ActorFixture {
  accessToken: string;
  userId: string;
}

interface Reply {
  statusCode: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

async function insertActor(username: string): Promise<ActorFixture> {
  const userId = randomUUID();
  const sessionId = randomUUID();
  await withDatabase(async (client) => {
    await client.query(
      `INSERT INTO "User" ("id", "username", "username_canonical", "display_name", "password_hash") VALUES ($1, $2, $2, $2, $3)`,
      [userId, username, passwordHash],
    );
    await client.query(
      `INSERT INTO "AuthSession" ("id", "user_id", "absolute_ends_at") VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '30 days')`,
      [sessionId, userId],
    );
  });
  return { userId, accessToken: await jwt.signAsync({ sub: userId, sid: sessionId }) };
}

async function api(actor: ActorFixture, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown): Promise<Reply> {
  const inject = app.getHttpAdapter().getInstance().inject.bind(app.getHttpAdapter().getInstance());
  const body = await fixtureEditPayload(method, url, payload, async (readUrl) => (await inject({
    method: 'GET', url: readUrl, headers: { authorization: `Bearer ${actor.accessToken}` },
  })).json());
  return inject({
    method,
    url,
    headers: { authorization: `Bearer ${actor.accessToken}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { payload: body as Record<string, unknown> }),
  });
}

async function createHousehold(actor: ActorFixture, name: string): Promise<string> {
  const response = await api(actor, 'POST', '/api/v1/households', { name });
  expect(response.statusCode).toBe(201);
  return response.json().id as string;
}

async function addMember(householdId: string, actor: ActorFixture): Promise<void> {
  await withDatabase(client => client.query(`INSERT INTO "memberships" ("user_id", "household_id", "role") VALUES ($1, $2, 'MEMBER')`, [actor.userId, householdId]));
}

const tasksUrl = (householdId: string) => `/api/v1/households/${householdId}/tasks`;
const eventsUrl = (householdId: string) => `/api/v1/households/${householdId}/events`;

async function createTask(actor: ActorFixture, householdId: string, payload: Record<string, unknown>): Promise<{ id: string; recurrenceRuleId: string | null }> {
  const response = await api(actor, 'POST', tasksUrl(householdId), payload);
  expect(response.statusCode).toBe(201);
  return response.json();
}

async function createEvent(actor: ActorFixture, householdId: string, payload: Record<string, unknown>): Promise<{ id: string; recurrenceRuleId: string | null }> {
  const response = await api(actor, 'POST', eventsUrl(householdId), payload);
  expect(response.statusCode).toBe(201);
  return response.json();
}

async function upcoming(actor: ActorFixture, timeZone = SHANGHAI): Promise<Array<Record<string, any>>> {
  const response = await api(actor, 'GET', `/api/v1/users/me/reminders?timeZone=${encodeURIComponent(timeZone)}`);
  expect(response.statusCode).toBe(200);
  return response.json().reminders;
}

function inHours(hours: number): Date {
  // Whole minutes, as the forms store them.
  return new Date(Math.ceil((Date.now() + hours * HOUR) / 60_000) * 60_000);
}

beforeAll(async () => {
  passwordHash = await argon2.hash('reminders-fixture-password', { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  app = await createApplication({
    ...process.env,
    NODE_ENV: 'test',
    E2E_DISABLE_RATE_LIMITS: 'true',
    JWT_ACCESS_SECRET: accessSecret,
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

describe('reminder settings', () => {
  test('start from the defaults and are replaced as a whole, including household mutes', async () => {
    const owner = await insertActor('settings-owner');
    const home = await createHousehold(owner, '小林之家');
    const parents = await createHousehold(owner, '爸妈家');

    const initial = await api(owner, 'GET', '/api/v1/users/me/reminder-settings');
    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toEqual({
      taskMinutesBefore: 0,
      eventMinutesBefore: 15,
      dateOnlyTime: '09:00',
      alarm: false,
      households: [{ id: home, name: '小林之家', muted: false }, { id: parents, name: '爸妈家', muted: false }],
    });

    const saved = await api(owner, 'PUT', '/api/v1/users/me/reminder-settings', {
      taskMinutesBefore: null, eventMinutesBefore: 30, dateOnlyTime: '20:15', alarm: true, mutedHouseholdIds: [parents],
    });
    expect(saved.statusCode).toBe(200);
    const reread = (await api(owner, 'GET', '/api/v1/users/me/reminder-settings')).json();
    expect(reread).toEqual({
      taskMinutesBefore: null,
      eventMinutesBefore: 30,
      dateOnlyTime: '20:15',
      alarm: true,
      households: [{ id: home, name: '小林之家', muted: false }, { id: parents, name: '爸妈家', muted: true }],
    });

    await api(owner, 'PUT', '/api/v1/users/me/reminder-settings', {
      taskMinutesBefore: 0, eventMinutesBefore: 30, dateOnlyTime: '20:15', alarm: false, mutedHouseholdIds: [],
    });
    const cleared = (await api(owner, 'GET', '/api/v1/users/me/reminder-settings')).json();
    expect(cleared.households.every((household: { muted: boolean }) => !household.muted)).toBe(true);
    expect(cleared.alarm).toBe(false);
  });

  test('reject a household the caller does not belong to, and leave the settings unchanged', async () => {
    const owner = await insertActor('settings-mute-owner');
    const stranger = await insertActor('settings-mute-stranger');
    await createHousehold(owner, '小林之家');
    const foreign = await createHousehold(stranger, '别人家');

    const response = await api(owner, 'PUT', '/api/v1/users/me/reminder-settings', {
      taskMinutesBefore: 5, eventMinutesBefore: 5, dateOnlyTime: '07:00', alarm: true, mutedHouseholdIds: [foreign],
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.details).toEqual([{ field: 'mutedHouseholdIds', codes: ['not_member'] }]);
    expect((await api(owner, 'GET', '/api/v1/users/me/reminder-settings')).json()).toMatchObject({ taskMinutesBefore: 0, alarm: false });
    const strangerView = (await api(stranger, 'GET', '/api/v1/users/me/reminder-settings')).json();
    expect(strangerView.households).toEqual([{ id: foreign, name: '别人家', muted: false }]);
  });

  test('require every field, so an omitted value is never read as "off"', async () => {
    const owner = await insertActor('settings-shape-owner');
    for (const payload of [
      { eventMinutesBefore: 15, dateOnlyTime: '09:00', alarm: false, mutedHouseholdIds: [] },
      { taskMinutesBefore: 0, eventMinutesBefore: 15, dateOnlyTime: '24:00', alarm: false, mutedHouseholdIds: [] },
      { taskMinutesBefore: 10_081, eventMinutesBefore: 15, dateOnlyTime: '09:00', alarm: false, mutedHouseholdIds: [] },
      { taskMinutesBefore: 1.5, eventMinutesBefore: 15, dateOnlyTime: '09:00', alarm: false, mutedHouseholdIds: [] },
      { taskMinutesBefore: 0, eventMinutesBefore: 15, dateOnlyTime: '09:00', mutedHouseholdIds: [] },
      { taskMinutesBefore: 0, eventMinutesBefore: 15, dateOnlyTime: '09:00', alarm: 'yes', mutedHouseholdIds: [] },
    ]) {
      const response = await api(owner, 'PUT', '/api/v1/users/me/reminder-settings', payload);
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_FAILED');
    }
    expect((await withDatabase(client => client.query('SELECT 1 FROM "reminder_settings"'))).rowCount).toBe(0);
  });
});

describe('personal reminders on tasks and events', () => {
  test('belong to the person who set them; family members keep following their own defaults', async () => {
    const owner = await insertActor('choice-owner');
    const member = await insertActor('choice-member');
    const householdId = await createHousehold(owner, '小林之家');
    await addMember(householdId, member);

    const task = await createTask(owner, householdId, { title: '交水费', dueDate: inHours(5).toISOString(), myReminder: { mode: 'before', minutesBefore: 30 } });
    expect((await api(owner, 'GET', `${tasksUrl(householdId)}/${task.id}`)).json().myReminder).toEqual({ mode: 'before', minutesBefore: 30, alarm: null });
    expect((await api(member, 'GET', `${tasksUrl(householdId)}/${task.id}`)).json().myReminder).toEqual({ mode: 'default', minutesBefore: null, alarm: null });

    const silenced = await api(member, 'PUT', `${tasksUrl(householdId)}/${task.id}/my-reminder`, { mode: 'off' });
    expect(silenced.statusCode).toBe(200);
    expect(silenced.json()).toEqual({ mode: 'off', minutesBefore: null, alarm: null });
    const memberList = (await api(member, 'GET', tasksUrl(householdId))).json().tasks;
    expect(memberList[0].myReminder).toEqual({ mode: 'off', minutesBefore: null, alarm: null });
    expect((await api(owner, 'GET', tasksUrl(householdId))).json().tasks[0].myReminder).toEqual({ mode: 'before', minutesBefore: 30, alarm: null });

    // Back to the default removes the personal row instead of storing a copy of the default.
    await api(member, 'PUT', `${tasksUrl(householdId)}/${task.id}/my-reminder`, { mode: 'default' });
    const rows = await withDatabase(client => client.query('SELECT "user_id" FROM "reminder_overrides" WHERE "task_id" = $1', [task.id]));
    expect(rows.rows).toEqual([{ user_id: owner.userId }]);
  });

  test('a personal reminder does not count as an edit of the shared content', async () => {
    const owner = await insertActor('choice-version-owner');
    const householdId = await createHousehold(owner, '小林之家');
    const event = await createEvent(owner, householdId, { title: '打疫苗', startTime: inHours(5).toISOString(), endTime: inHours(6).toISOString() });
    const before = (await api(owner, 'GET', `${eventsUrl(householdId)}/${event.id}`)).json();

    const response = await api(owner, 'PUT', `${eventsUrl(householdId)}/${event.id}/my-reminder`, { mode: 'before', minutesBefore: 60 });
    expect(response.statusCode).toBe(200);
    const after = (await api(owner, 'GET', `${eventsUrl(householdId)}/${event.id}`)).json();
    expect(after.updatedAt).toBe(before.updatedAt);
    expect(after.myReminder).toEqual({ mode: 'before', minutesBefore: 60, alarm: null });
  });

  test('reject malformed choices', async () => {
    const owner = await insertActor('choice-shape-owner');
    const householdId = await createHousehold(owner, '小林之家');
    const task = await createTask(owner, householdId, { title: '交水费' });
    for (const body of [{ mode: 'before' }, { mode: 'before', minutesBefore: 10_081 }, { mode: 'before', minutesBefore: -1 }, { mode: 'soon' }, { mode: 'default', alarm: 'yes' }]) {
      const response = await api(owner, 'PUT', `${tasksUrl(householdId)}/${task.id}/my-reminder`, body);
      expect(response.statusCode).toBe(400);
    }
    const created = await api(owner, 'POST', tasksUrl(householdId), { title: '坏的', myReminder: { mode: 'before' } });
    expect(created.statusCode).toBe(400);
    expect((await withDatabase(client => client.query('SELECT 1 FROM "reminder_overrides"'))).rowCount).toBe(0);
  });

  test('do not reach content outside the caller\'s households', async () => {
    const owner = await insertActor('choice-scope-owner');
    const outsider = await insertActor('choice-scope-outsider');
    const householdId = await createHousehold(owner, '小林之家');
    const otherHousehold = await createHousehold(outsider, '别人家');
    const task = await createTask(owner, householdId, { title: '交水费' });
    const event = await createEvent(owner, householdId, { title: '打疫苗', startTime: inHours(5).toISOString(), endTime: inHours(6).toISOString() });

    const notMember = await api(outsider, 'PUT', `${tasksUrl(householdId)}/${task.id}/my-reminder`, { mode: 'off' });
    expect(notMember.statusCode).toBe(404);
    expect(notMember.json().error.code).toBe('HOUSEHOLD_NOT_FOUND');
    const wrongHousehold = await api(outsider, 'PUT', `${tasksUrl(otherHousehold)}/${task.id}/my-reminder`, { mode: 'off' });
    expect(wrongHousehold.statusCode).toBe(404);
    expect(wrongHousehold.json().error.code).toBe('TASK_NOT_FOUND');
    const wrongEvent = await api(outsider, 'PUT', `${eventsUrl(otherHousehold)}/${event.id}/my-reminder`, { mode: 'off' });
    expect(wrongEvent.statusCode).toBe(404);
    expect(wrongEvent.json().error.code).toBe('EVENT_NOT_FOUND');
    expect((await withDatabase(client => client.query('SELECT 1 FROM "reminder_overrides"'))).rowCount).toBe(0);
  });

  test('on a recurring item apply to the whole series and follow it through a split', async () => {
    const owner = await insertActor('choice-series-owner');
    const householdId = await createHousehold(owner, '小林之家');
    const startsOn = formatIsoDate(addDays(currentCalendarDateIn('UTC'), -3));
    const created = await createTask(owner, householdId, {
      title: '倒垃圾',
      recurrence: { freq: 'daily', startsOn, timezone: 'UTC', startTimeLocal: '08:00' },
      myReminder: { mode: 'before', minutesBefore: 60, alarm: true },
    });
    const stored = await withDatabase(client => client.query('SELECT "task_id", "recurrence_rule_id", "minutes_before", "alarm" FROM "reminder_overrides"'));
    expect(stored.rows).toEqual([{ task_id: null, recurrence_rule_id: created.recurrenceRuleId, minutes_before: 60, alarm: true }]);

    const occurrences = (await api(owner, 'GET', tasksUrl(householdId))).json().tasks
      .sort((left: { occurrenceDate: string }, right: { occurrenceDate: string }) => left.occurrenceDate.localeCompare(right.occurrenceDate));
    expect(occurrences.length).toBeGreaterThanOrEqual(4);
    expect(occurrences.every((task: { myReminder: unknown }) => JSON.stringify(task.myReminder) === JSON.stringify({ mode: 'before', minutesBefore: 60, alarm: true }))).toBe(true);

    // Changing it on any occurrence changes the series.
    await api(owner, 'PUT', `${tasksUrl(householdId)}/${occurrences[1].id}/my-reminder`, { mode: 'before', minutesBefore: 15, alarm: true });
    expect((await api(owner, 'GET', `${tasksUrl(householdId)}/${occurrences[3].id}`)).json().myReminder).toEqual({ mode: 'before', minutesBefore: 15, alarm: true });

    const split = await api(owner, 'PUT', `${tasksUrl(householdId)}/${occurrences[2].id}/series`, { title: '倒垃圾（新）' });
    expect(split.statusCode).toBe(200);
    const successor = split.json().recurrenceRuleId as string;
    expect(successor).not.toBe(created.recurrenceRuleId);
    const successorRows = (await api(owner, 'GET', tasksUrl(householdId))).json().tasks.filter((task: { recurrenceRuleId: string }) => task.recurrenceRuleId === successor);
    expect(successorRows.length).toBeGreaterThan(0);
    expect(successorRows.every((task: { myReminder: unknown }) => JSON.stringify(task.myReminder) === JSON.stringify({ mode: 'before', minutesBefore: 15, alarm: true }))).toBe(true);
  });

  test('choose whether to ring apart from when, each following the defaults until set', async () => {
    const owner = await insertActor('choice-alarm-owner');
    const householdId = await createHousehold(owner, '小林之家');
    const task = await createTask(owner, householdId, { title: '吃药', dueDate: inHours(5).toISOString(), myReminder: { mode: 'default', alarm: true } });
    const rows = () => withDatabase(client => client.query('SELECT "mode", "minutes_before", "alarm" FROM "reminder_overrides" WHERE "task_id" = $1', [task.id]));
    expect((await api(owner, 'GET', `${tasksUrl(householdId)}/${task.id}`)).json().myReminder).toEqual({ mode: 'default', minutesBefore: null, alarm: true });
    expect((await rows()).rows).toEqual([{ mode: 'default', minutes_before: null, alarm: true }]);

    // No reminder has nothing to ring, so the choice to ring is not kept.
    const off = await api(owner, 'PUT', `${tasksUrl(householdId)}/${task.id}/my-reminder`, { mode: 'off', alarm: true });
    expect(off.json()).toEqual({ mode: 'off', minutesBefore: null, alarm: null });
    expect((await rows()).rows).toEqual([{ mode: 'off', minutes_before: null, alarm: null }]);

    const quiet = await api(owner, 'PUT', `${tasksUrl(householdId)}/${task.id}/my-reminder`, { mode: 'before', minutesBefore: 5, alarm: false });
    expect(quiet.json()).toEqual({ mode: 'before', minutesBefore: 5, alarm: false });

    // Omitting the alarm follows the default again; with the default time too, the row goes.
    await api(owner, 'PUT', `${tasksUrl(householdId)}/${task.id}/my-reminder`, { mode: 'default' });
    expect((await rows()).rowCount).toBe(0);
    expect((await api(owner, 'GET', `${tasksUrl(householdId)}/${task.id}`)).json().myReminder).toEqual({ mode: 'default', minutesBefore: null, alarm: null });
  });

  test('disappear with the content they belong to', async () => {
    const owner = await insertActor('choice-cascade-owner');
    const householdId = await createHousehold(owner, '小林之家');
    const task = await createTask(owner, householdId, { title: '交水费', myReminder: { mode: 'off' } });
    expect((await api(owner, 'DELETE', `${tasksUrl(householdId)}/${task.id}`)).statusCode).toBe(204);
    expect((await withDatabase(client => client.query('SELECT 1 FROM "reminder_overrides"'))).rowCount).toBe(0);
  });
});

describe('upcoming reminders', () => {
  test('reach the assignee, or the creator of an unassigned task, and every member for events', async () => {
    const owner = await insertActor('upcoming-owner');
    const member = await insertActor('upcoming-member');
    const householdId = await createHousehold(owner, '小林之家');
    await addMember(householdId, member);

    const assignedDue = inHours(2);
    const assigned = await createTask(owner, householdId, { title: '接孩子', dueDate: assignedDue.toISOString(), assigneeIds: [member.userId] });
    const unassigned = await createTask(owner, householdId, { title: '交水费', dueDate: inHours(3).toISOString() });
    await createTask(owner, householdId, { title: '已完成', dueDate: inHours(4).toISOString(), status: 'completed' });
    await createTask(owner, householdId, { title: '已过期', dueDate: inHours(-1).toISOString() });
    const start = inHours(5);
    const event = await createEvent(owner, householdId, { title: '打疫苗', startTime: start.toISOString(), endTime: inHours(6).toISOString(), location: '社区卫生服务中心' });

    const memberReminders = await upcoming(member);
    expect(memberReminders.map(reminder => [reminder.key, reminder.fireAt])).toEqual([
      [`task:${assigned.id}`, assignedDue.toISOString()],
      [`event:${event.id}`, new Date(start.getTime() - 15 * 60_000).toISOString()],
    ]);
    expect(memberReminders[1]).toMatchObject({
      kind: 'event', householdId, householdName: '小林之家', itemId: event.id, occurrenceDate: null,
      title: '打疫苗', at: start.toISOString(), dateOnly: false, location: '社区卫生服务中心',
    });
    expect((await upcoming(owner)).map(reminder => reminder.key)).toEqual([`task:${unassigned.id}`, `event:${event.id}`]);
  });

  test('follow personal choices, defaults and household mutes', async () => {
    const owner = await insertActor('upcoming-choice-owner');
    const householdId = await createHousehold(owner, '小林之家');
    const quiet = await createHousehold(owner, '爸妈家');
    const due = inHours(30);
    const task = await createTask(owner, householdId, { title: '交水费', dueDate: due.toISOString(), myReminder: { mode: 'before', minutesBefore: 1440 } });
    const event = await createEvent(owner, householdId, { title: '打疫苗', startTime: inHours(5).toISOString(), endTime: inHours(6).toISOString(), myReminder: { mode: 'off' } });
    await createEvent(owner, quiet, { title: '爸妈的日程', startTime: inHours(7).toISOString(), endTime: inHours(8).toISOString() });
    await api(owner, 'PUT', '/api/v1/users/me/reminder-settings', {
      taskMinutesBefore: 0, eventMinutesBefore: 15, dateOnlyTime: '09:00', alarm: false, mutedHouseholdIds: [quiet],
    });

    const reminders = await upcoming(owner);
    expect(reminders.map(reminder => [reminder.key, reminder.fireAt])).toEqual([[`task:${task.id}`, new Date(due.getTime() - 1440 * 60_000).toISOString()]]);
    expect(reminders.some(reminder => reminder.key === `event:${event.id}`)).toBe(false);
  });

  test('ring by each person\'s own choice, or by their default', async () => {
    const owner = await insertActor('upcoming-alarm-owner');
    const member = await insertActor('upcoming-alarm-member');
    const householdId = await createHousehold(owner, '小林之家');
    await addMember(householdId, member);
    const event = await createEvent(owner, householdId, { title: '复查', startTime: inHours(5).toISOString(), endTime: inHours(6).toISOString(), myReminder: { mode: 'default', alarm: true } });
    const quiet = await createEvent(owner, householdId, { title: '买菜', startTime: inHours(7).toISOString(), endTime: inHours(8).toISOString(), myReminder: { mode: 'before', minutesBefore: 30, alarm: false } });
    const plain = await createEvent(owner, householdId, { title: '散步', startTime: inHours(9).toISOString(), endTime: inHours(10).toISOString() });
    const ringing = async (actor: ActorFixture) => (await upcoming(actor)).map(reminder => [reminder.key, reminder.alarm]);

    expect(await ringing(owner)).toEqual([[`event:${event.id}`, true], [`event:${quiet.id}`, false], [`event:${plain.id}`, false]]);
    // The member's reminders follow only the member's defaults.
    await api(member, 'PUT', '/api/v1/users/me/reminder-settings', { taskMinutesBefore: 0, eventMinutesBefore: 15, dateOnlyTime: '09:00', alarm: true, mutedHouseholdIds: [] });
    expect(await ringing(member)).toEqual([[`event:${event.id}`, true], [`event:${quiet.id}`, true], [`event:${plain.id}`, true]]);
    await api(owner, 'PUT', '/api/v1/users/me/reminder-settings', { taskMinutesBefore: 0, eventMinutesBefore: 15, dateOnlyTime: '09:00', alarm: true, mutedHouseholdIds: [] });
    expect(await ringing(owner)).toEqual([[`event:${event.id}`, true], [`event:${quiet.id}`, false], [`event:${plain.id}`, true]]);
  });

  test('time a date-only task by the date-only time on its local day', async () => {
    const owner = await insertActor('upcoming-date-owner');
    const householdId = await createHousehold(owner, '小林之家');
    const day = addDays(currentCalendarDateIn(SHANGHAI), 2);
    // A date without a time is stored as local midnight, as the task form sends it.
    const task = await createTask(owner, householdId, { title: '体检', dueDate: localDateTimeToInstant(day, 0, 0, SHANGHAI).toISOString() });
    await api(owner, 'PUT', '/api/v1/users/me/reminder-settings', { taskMinutesBefore: 0, eventMinutesBefore: 15, dateOnlyTime: '08:30', alarm: false, mutedHouseholdIds: [] });

    const [reminder] = await upcoming(owner);
    expect(reminder).toMatchObject({ key: `task:${task.id}`, dateOnly: true, fireAt: localDateTimeToInstant(day, 8, 30, SHANGHAI).toISOString() });
  });

  test('include series occurrences that have no row yet, once each, keyed like their future rows', async () => {
    const owner = await insertActor('upcoming-series-owner');
    const householdId = await createHousehold(owner, '小林之家');
    const today = currentCalendarDateIn(SHANGHAI);
    const created = await createEvent(owner, householdId, {
      title: '晨跑',
      startTime: localDateTimeToInstant(today, 23, 0, SHANGHAI).toISOString(),
      endTime: localDateTimeToInstant(today, 23, 30, SHANGHAI).toISOString(),
      recurrence: { freq: 'daily', startsOn: formatIsoDate(today), timezone: SHANGHAI, startTimeLocal: '23:00', durationMinutes: 30 },
    });
    const ruleId = created.recurrenceRuleId!;
    const rows = await withDatabase(client => client.query('SELECT "occurrence_date"::text AS "date" FROM "events" WHERE "recurrence_rule_id" = $1', [ruleId]));
    const materialized = new Set(rows.rows.map(row => row.date as string));

    const reminders = (await upcoming(owner)).filter(reminder => reminder.key.startsWith(`event:${ruleId}:`));
    const keys = reminders.map(reminder => reminder.key);
    expect(new Set(keys).size).toBe(keys.length);
    const tomorrow = formatIsoDate(addDays(today, 1));
    expect(materialized.has(tomorrow)).toBe(false);
    expect(reminders.find(reminder => reminder.occurrenceDate === tomorrow)).toMatchObject({
      key: `event:${ruleId}:${tomorrow}`, itemId: null, title: '晨跑',
      fireAt: localDateTimeToInstant(addDays(today, 1), 22, 45, SHANGHAI).toISOString(),
    });
    for (const reminder of reminders) {
      expect(reminder.itemId === null).toBe(!materialized.has(reminder.occurrenceDate));
    }
    // A full week of evenings, give or take today's having passed.
    expect(reminders.length).toBeGreaterThanOrEqual(6);
    expect(reminders.length).toBeLessThanOrEqual(7);
  });

  test('need a valid time zone', async () => {
    const owner = await insertActor('upcoming-zone-owner');
    for (const url of ['/api/v1/users/me/reminders', '/api/v1/users/me/reminders?timeZone=Mars%2FOlympus']) {
      const response = await api(owner, 'GET', url);
      expect(response.statusCode).toBe(400);
      expect(response.json().error.details).toEqual([{ field: 'timeZone', codes: ['invalid_time_zone'] }]);
    }
  });
});
