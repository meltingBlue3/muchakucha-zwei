import { fixtureEditPayload } from '../../../../scripts/test-edit-version.js';
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApplication } from '../../src/main.js';
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

function noteApi(
  actor: ActorFixture,
  householdId: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path = '',
  payload?: unknown,
): Promise<ApiResponse> {
  return request(actor.accessToken, method, `/households/${encodeURIComponent(householdId)}/notes${path}`, payload);
}

async function createNote(actor: ActorFixture, householdId: string, payload: unknown): Promise<string> {
  const response = await noteApi(actor, householdId, 'POST', '', payload);
  expect(response.statusCode).toBe(201);
  return (response.json() as { id: string }).id;
}

beforeAll(async () => {
  passwordHash = await argon2.hash('notes-fixture-password', {
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

afterAll(async () => {
  await app?.close();
});

beforeEach(async () => {
  await resetDatabase();
});

describe('notes API contract', () => {
  let owner: ActorFixture;
  let admin: ActorFixture;
  let member: ActorFixture;
  let otherMember: ActorFixture;
  let outsider: ActorFixture;
  let householdId: string;

  beforeEach(async () => {
    [owner, admin, member, otherMember, outsider] = await Promise.all([
      insertActor('owner-notes', '笔记主人'),
      insertActor('admin-notes', '笔记管理员'),
      insertActor('member-notes', '笔记成员'),
      insertActor('other-notes', '另一位成员'),
      insertActor('outsider-notes', '无关人员'),
    ]);
    householdId = await createHousehold(owner.accessToken, '笔记组');
    await addMemberViaDb(householdId, admin, 'ADMIN');
    await addMemberViaDb(householdId, member, 'MEMBER');
    await addMemberViaDb(householdId, otherMember, 'MEMBER');
  });

  test('trims the title but preserves Markdown body whitespace', async () => {
    const response = await noteApi(member, householdId, 'POST', '', {
      title: '  购物清单  ',
      body: '  牛奶\n鸡蛋  ',
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({
      householdId,
      title: '购物清单',
      body: '  牛奶\n鸡蛋  ',
      createdBy: member.userId,
    });
    expect(body.id).toEqual(expect.any(String));
    expect(Date.parse(body.createdAt)).not.toBeNaN();
    expect(Date.parse(body.updatedAt)).not.toBeNaN();
  });

  test('preserves Markdown source on update and subsequent read', async () => {
    const noteId = await createNote(member, householdId, { title: '格式笔记' });
    const source = '    缩进代码\n\n**粗体**  \n下一行\n';
    const update = await noteApi(member, householdId, 'PUT', `/${noteId}`, { body: source });
    expect(update.statusCode).toBe(200);
    expect((await noteApi(member, householdId, 'GET', `/${noteId}`)).json().body).toBe(source);
  });

  test('stores a missing or blank body as null', async () => {
    const withoutBody = await noteApi(owner, householdId, 'POST', '', { title: '无正文' });
    const blankBody = await noteApi(owner, householdId, 'POST', '', { title: '空白正文', body: '   ' });

    expect(withoutBody.statusCode).toBe(201);
    expect(withoutBody.json().body).toBeNull();
    expect(blankBody.statusCode).toBe(201);
    expect(blankBody.json().body).toBeNull();
  });

  test.each([
    ['missing title', {}],
    ['empty title', { title: '' }],
    ['whitespace-only title', { title: '   ' }],
    ['title over 200 characters', { title: 'a'.repeat(201) }],
    ['non-string body', { title: '标题', body: 42 }],
  ])('rejects %s', async (_name, payload) => {
    const response = await noteApi(owner, householdId, 'POST', '', payload);

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_FAILED');
  });

  test('accepts a 200-character title', async () => {
    const response = await noteApi(owner, householdId, 'POST', '', { title: 'a'.repeat(200) });

    expect(response.statusCode).toBe(201);
  });

  test('lists household notes most recently updated first with a total', async () => {
    const firstId = await createNote(owner, householdId, { title: '第一条' });
    const secondId = await createNote(member, householdId, { title: '第二条' });
    const otherHouseholdId = await createHousehold(outsider.accessToken, '别人的家');
    await createNote(outsider, otherHouseholdId, { title: '别人的笔记' });

    const response = await noteApi(otherMember, householdId, 'GET');

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.total).toBe(2);
    expect(body.notes.map((note: { id: string }) => note.id)).toEqual([secondId, firstId]);
  });

  test('an edited note moves to the front of the list', async () => {
    const firstId = await createNote(owner, householdId, { title: '先建的' });
    const secondId = await createNote(member, householdId, { title: '后建的' });

    // Ordering by creation would keep the newer note first; only updatedAt
    // moves the edited one, so this fails if the sort regresses.
    const edit = await noteApi(owner, householdId, 'PUT', `/${firstId}`, { title: '先建的（改过）' });
    expect(edit.statusCode).toBe(200);

    const response = await noteApi(member, householdId, 'GET');

    expect(response.statusCode).toBe(200);
    expect(response.json().notes.map((note: { id: string }) => note.id)).toEqual([firstId, secondId]);
  });

  test('retrieves a note by id for any household member', async () => {
    const noteId = await createNote(owner, householdId, { title: '家庭 Wi-Fi', body: '密码在冰箱上' });

    const response = await noteApi(member, householdId, 'GET', `/${noteId}`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: noteId, title: '家庭 Wi-Fi', body: '密码在冰箱上' });
  });

  test('updates only the provided fields', async () => {
    const noteId = await createNote(member, householdId, { title: '原标题', body: '原正文' });

    const titleOnly = await noteApi(member, householdId, 'PUT', `/${noteId}`, { title: ' 新标题 ' });
    expect(titleOnly.statusCode).toBe(200);
    expect(titleOnly.json()).toMatchObject({ title: '新标题', body: '原正文' });

    const bodyOnly = await noteApi(member, householdId, 'PUT', `/${noteId}`, { body: '' });
    expect(bodyOnly.statusCode).toBe(200);
    expect(bodyOnly.json()).toMatchObject({ title: '新标题', body: null });
  });

  test('records the author as the last editor of a new note', async () => {
    const created = await noteApi(member, householdId, 'POST', '', { title: '新笔记' });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ createdBy: member.userId, updatedBy: member.userId });
    expect((await noteApi(owner, householdId, 'GET', `/${created.json().id}`)).json().updatedBy).toBe(member.userId);
  });

  test('records the member who saved a note last without changing its author', async () => {
    const noteId = await createNote(member, householdId, { title: '共同的清单', body: '- [ ] 牛奶' });

    const update = await noteApi(otherMember, householdId, 'PUT', `/${noteId}`, { body: '- [x] 牛奶' });

    expect(update.statusCode).toBe(200);
    expect(update.json()).toMatchObject({ createdBy: member.userId, updatedBy: otherMember.userId });
    const stored = (await noteApi(member, householdId, 'GET', `/${noteId}`)).json();
    expect(stored).toMatchObject({ body: '- [x] 牛奶', createdBy: member.userId, updatedBy: otherMember.userId });
    const listed = (await noteApi(owner, householdId, 'GET')).json().notes.find((note: { id: string }) => note.id === noteId);
    expect(listed.updatedBy).toBe(otherMember.userId);
  });

  test('a deleted account no longer shows as the last editor', async () => {
    const noteId = await createNote(member, householdId, { title: '有人改过' });
    expect((await noteApi(otherMember, householdId, 'PUT', `/${noteId}`, { title: '有人改过了' })).statusCode).toBe(200);

    await withDatabase((client) => client.query(`DELETE FROM "User" WHERE "id" = $1`, [otherMember.userId]));

    expect((await noteApi(member, householdId, 'GET', `/${noteId}`)).json()).toMatchObject({ title: '有人改过了', createdBy: member.userId, updatedBy: null });
  });

  test('rejects a whitespace-only title on update', async () => {
    const noteId = await createNote(owner, householdId, { title: '保持不变' });

    const response = await noteApi(owner, householdId, 'PUT', `/${noteId}`, { title: '   ' });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_FAILED');
    const unchanged = await noteApi(owner, householdId, 'GET', `/${noteId}`);
    expect(unchanged.json().title).toBe('保持不变');
  });

  test('deletes a note', async () => {
    const noteId = await createNote(member, householdId, { title: '待删除' });

    const response = await noteApi(member, householdId, 'DELETE', `/${noteId}`);

    expect(response.statusCode).toBe(204);
    expect((await noteApi(member, householdId, 'GET', `/${noteId}`)).statusCode).toBe(404);
    expect((await noteApi(member, householdId, 'GET')).json().total).toBe(0);
  });

  test.each(['notes', 'tasks', 'events'])('%s requires a valid explicit edit version', async (resource) => {
    const raw = (method: 'POST' | 'PUT' | 'GET', path: string, payload?: Record<string, unknown>) => app.getHttpAdapter().getInstance().inject({
      method, url: `/api/v1/households/${householdId}/${resource}${path}`,
      headers: { authorization: `Bearer ${member.accessToken}` },
      ...(payload === undefined ? {} : { payload }),
    });
    const created = await raw('POST', '', { title: '不能无版本覆盖', ...(resource === 'events' ? { startTime: '2030-01-01T09:00:00Z', endTime: '2030-01-01T10:00:00Z' } : {}) });
    expect(created.statusCode).toBe(201);
    const base = created.json();
    for (const version of [{}, { expectedUpdatedAt: null }, { expectedUpdatedAt: '' }, { expectedUpdatedAt: 'invalid' }]) {
      const rejected = await raw('PUT', `/${base.id}`, { title: '不能写入', ...version });
      expect(rejected.statusCode).toBe(400);
      expect(rejected.json().error.code).toBe('VALIDATION_FAILED');
      expect((await raw('GET', `/${base.id}`)).json()).toMatchObject({ title: base.title, updatedAt: base.updatedAt });
    }
  });

  test.each(['tasks', 'events'])('%s requires both occurrence and rule versions for recurring edits', async (resource) => {
    const raw = (method: 'POST' | 'PUT' | 'GET', path: string, payload?: Record<string, unknown>) => app.getHttpAdapter().getInstance().inject({
      method, url: `/api/v1/households/${householdId}/${path}`,
      headers: { authorization: `Bearer ${member.accessToken}` },
      ...(payload === undefined ? {} : { payload }),
    });
    const today = new Date().toISOString().slice(0, 10);
    const recurrence = { freq: 'daily', startsOn: today, timezone: 'UTC' };
    const created = await raw('POST', resource, { title: '重复安排', recurrence, ...(resource === 'events' ? { startTime: `${today}T09:00:00Z`, endTime: `${today}T10:00:00Z` } : {}) });
    expect(created.statusCode).toBe(201);
    const base = created.json();
    for (const suffix of ['', '/series']) {
      for (const version of [{ expectedUpdatedAt: base.updatedAt }, { expectedUpdatedAt: base.updatedAt, expectedRuleUpdatedAt: null }, { expectedRuleUpdatedAt: base.recurrence.updatedAt }]) {
        const rejected = await raw('PUT', `${resource}/${base.id}${suffix}`, { title: '不能写入', ...version });
        expect(rejected.statusCode).toBe(400);
        expect(rejected.json().error.code).toBe('VALIDATION_FAILED');
        expect((await raw('GET', `${resource}/${base.id}`)).json()).toMatchObject({ title: base.title, updatedAt: base.updatedAt, recurrence: { updatedAt: base.recurrence.updatedAt } });
      }
    }
    const rulePath = `recurrence-rules/${base.recurrenceRuleId}`;
    const rejectedRule = await raw('PUT', rulePath, { recurrence });
    expect(rejectedRule.statusCode).toBe(400);
    expect((await raw('GET', rulePath)).json().updatedAt).toBe(base.recurrence.updatedAt);
    const accepted = await raw('PUT', `${resource}/${base.id}`, { title: '有版本的修改', expectedUpdatedAt: base.updatedAt, expectedRuleUpdatedAt: base.recurrence.updatedAt });
    expect(accepted.statusCode).toBe(200);
    expect((await raw('GET', `${resource}/${base.id}`)).json().title).toBe('有版本的修改');
  });

  test.each(['notes', 'tasks', 'events'])('%s rejects stale and racing saves without changing related data', async (resource) => {
    const request = async (method: 'POST' | 'GET' | 'PUT', path: string, payload?: Record<string, unknown>) => app.getHttpAdapter().getInstance().inject({
      method, url: `/api/v1/households/${householdId}/${resource}${path}`,
      headers: { authorization: `Bearer ${member.accessToken}` },
      ...(payload === undefined ? {} : { payload }),
    });
    const initial = { title: '初始内容', ...(resource === 'events' ? { startTime: '2030-01-01T09:00:00Z', endTime: '2030-01-01T10:00:00Z' } : {}) };
    const created = await request('POST', '', initial);
    expect(created.statusCode).toBe(201);
    const base = created.json();
    let labelId: string | undefined;
    if (resource !== 'notes') {
      const label = await app.getHttpAdapter().getInstance().inject({ method: 'POST', url: `/api/v1/households/${householdId}/labels`, headers: { authorization: `Bearer ${owner.accessToken}` }, payload: { name: `${resource}-label`, color: '#B94736' } });
      expect(label.statusCode).toBe(201);
      labelId = label.json().id;
    }
    const writes = await Promise.all(['甲的修改', '乙的修改'].map(title => request('PUT', `/${base.id}`, { title, expectedUpdatedAt: base.updatedAt, ...(labelId ? { labelIds: [labelId] } : {}) })));
    expect(writes.map(result => result.statusCode).sort()).toEqual([200, 409]);
    expect(writes.find(result => result.statusCode === 409)!.json().error.code).toBe('EDIT_CONFLICT');
    const winner = writes.find(result => result.statusCode === 200)!.json();
    const stale = await request('PUT', `/${base.id}`, { title: '旧稿覆盖', expectedUpdatedAt: base.updatedAt, ...(resource === 'tasks' ? { assigneeIds: [owner.userId] } : {}), ...(labelId ? { labelIds: [] } : {}) });
    expect(stale.statusCode).toBe(409);
    const saved = (await request('GET', `/${base.id}`)).json();
    expect(saved.title).toBe(winner.title);
    expect(saved.updatedAt).toBe(winner.updatedAt);
    if (resource === 'tasks') expect(saved.assigneeIds).toEqual([]);
    if (labelId) {
      expect(saved.labels.map((label: { id: string }) => label.id)).toEqual([labelId]);
      const invalid = await request('PUT', `/${base.id}`, { title: 'Must roll back', expectedUpdatedAt: saved.updatedAt, labelIds: [randomUUID()], ...(resource === 'tasks' ? { assigneeIds: [owner.userId] } : {}) });
      expect(invalid.statusCode).toBe(400);
      expect((await request('GET', `/${base.id}`)).json()).toMatchObject({ title: saved.title, updatedAt: saved.updatedAt, ...(resource === 'tasks' ? { assigneeIds: [] } : {}) });
    }
    const reviewed = await request('PUT', `/${base.id}`, { title: '对照后整理', expectedUpdatedAt: saved.updatedAt });
    expect(reviewed.statusCode).toBe(200);
    expect((await request('GET', `/${base.id}`)).json().title).toBe('对照后整理');
  });

  test.each(['notes', 'tasks', 'events'])('%s deletes are checked against the version they were confirmed on', async (resource) => {
    const request = async (method: 'POST' | 'GET' | 'PUT' | 'DELETE', path: string, payload?: Record<string, unknown>) => app.getHttpAdapter().getInstance().inject({
      method, url: `/api/v1/households/${householdId}/${resource}${path}`,
      headers: { authorization: `Bearer ${member.accessToken}` },
      ...(payload === undefined ? {} : { payload }),
    });
    const initial = { title: '要删的内容', ...(resource === 'events' ? { startTime: '2030-01-01T09:00:00Z', endTime: '2030-01-01T10:00:00Z' } : {}) };
    const base = (await request('POST', '', initial)).json();
    const edited = await request('PUT', `/${base.id}`, { title: '别人刚改过', expectedUpdatedAt: base.updatedAt });
    expect(edited.statusCode).toBe(200);

    const stale = await request('DELETE', `/${base.id}?expectedUpdatedAt=${encodeURIComponent(base.updatedAt)}`);
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('EDIT_CONFLICT');
    expect((await request('GET', `/${base.id}`)).json().title).toBe('别人刚改过');

    const malformed = await request('DELETE', `/${base.id}?expectedUpdatedAt=yesterday`);
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error.details).toEqual([expect.objectContaining({ field: 'expectedUpdatedAt' })]);

    const current = await request('DELETE', `/${base.id}?expectedUpdatedAt=${encodeURIComponent(edited.json().updatedAt)}`);
    expect(current.statusCode).toBe(204);
    expect((await request('GET', `/${base.id}`)).statusCode).toBe(404);
  });

  test.each(['tasks', 'events'])('%s recurring deletes check both the occurrence and its series', async (resource) => {
    const request = async (method: 'POST' | 'GET' | 'PUT' | 'DELETE', path: string, payload?: Record<string, unknown>) => app.getHttpAdapter().getInstance().inject({
      method, url: `/api/v1/households/${householdId}/${resource}${path}`,
      headers: { authorization: `Bearer ${member.accessToken}` },
      ...(payload === undefined ? {} : { payload }),
    });
    const today = new Date().toISOString().slice(0, 10);
    const base = (await request('POST', '', {
      title: '每天的安排', recurrence: { freq: 'daily', startsOn: today, timezone: 'UTC' },
      ...(resource === 'events' ? { startTime: `${today}T09:00:00Z`, endTime: `${today}T10:00:00Z` } : {}),
    })).json();
    const edited = await request('PUT', `/${base.id}`, { title: '别人刚改过', expectedUpdatedAt: base.updatedAt, expectedRuleUpdatedAt: base.recurrence.updatedAt });
    expect(edited.statusCode).toBe(200);
    const saved = (await request('GET', `/${base.id}`)).json();
    const version = (occurrence: string, rule?: string) =>
      `expectedUpdatedAt=${encodeURIComponent(occurrence)}${rule === undefined ? '' : `&expectedRuleUpdatedAt=${encodeURIComponent(rule)}`}`;

    const withoutRule = await request('DELETE', `/${base.id}?${version(saved.updatedAt)}`);
    expect(withoutRule.statusCode).toBe(400);
    expect(withoutRule.json().error.details).toEqual([expect.objectContaining({ field: 'expectedRuleUpdatedAt', codes: ['required_version'] })]);
    for (const scope of ['this_only', 'this_and_following']) {
      const stale = await request('DELETE', `/${base.id}/series?scope=${scope}&${version(base.updatedAt, base.recurrence.updatedAt)}`);
      expect(stale.statusCode).toBe(409);
    }
    expect((await request('GET', `/${base.id}`)).json()).toMatchObject({ title: '别人刚改过', updatedAt: saved.updatedAt });

    const current = await request('DELETE', `/${base.id}/series?scope=this_and_following&${version(saved.updatedAt, saved.recurrence.updatedAt)}`);
    expect(current.statusCode).toBe(204);
  });

  describe('pins and labels', () => {
    async function createLabel(household: string, name: string): Promise<string> {
      const response = await request(owner.accessToken, 'POST', `/households/${household}/labels`, { name, color: '#2C716C' });
      expect(response.statusCode).toBe(201);
      return response.json().id;
    }

    const labelIdsOf = (note: { labels: Array<{ id: string }> }) => note.labels.map((label) => label.id);

    test('any member can pin, unpin and relabel a note someone else wrote', async () => {
      const noteId = await createNote(owner, householdId, { title: '家庭 Wi-Fi' });
      const [school, shopping] = await Promise.all([createLabel(householdId, '学校'), createLabel(householdId, '采购')]);

      const pinned = await noteApi(member, householdId, 'PUT', `/${noteId}/pin`);
      expect(pinned.statusCode).toBe(200);
      expect(Date.parse(pinned.json().pinnedAt)).not.toBeNaN();
      expect((await noteApi(otherMember, householdId, 'GET', `/${noteId}`)).json().pinnedAt).toBe(pinned.json().pinnedAt);

      // Pinning again keeps the note where it is rather than re-stamping it.
      const again = await noteApi(otherMember, householdId, 'PUT', `/${noteId}/pin`);
      expect(again.statusCode).toBe(200);
      expect(again.json().pinnedAt).toBe(pinned.json().pinnedAt);

      const householdOrder = (await request(member.accessToken, 'GET', `/households/${householdId}/labels`)).json().labels
        .map((label: { id: string }) => label.id).filter((id: string) => id === school || id === shopping);
      for (const labelIds of [[shopping, school, shopping], [school, shopping]]) {
        const relabelled = await noteApi(member, householdId, 'PUT', `/${noteId}/labels`, { labelIds });
        expect(relabelled.statusCode).toBe(200);
        // In the household list's order, whatever order they were sent in.
        expect(labelIdsOf(relabelled.json())).toEqual(householdOrder);
      }
      const listed = (await noteApi(owner, householdId, 'GET')).json().notes[0];
      expect(listed).toMatchObject({ id: noteId, pinnedAt: pinned.json().pinnedAt });
      expect(labelIdsOf(listed)).toEqual(householdOrder);

      const unpinned = await noteApi(otherMember, householdId, 'DELETE', `/${noteId}/pin`);
      expect(unpinned.statusCode).toBe(200);
      expect(unpinned.json().pinnedAt).toBeNull();
      expect((await noteApi(owner, householdId, 'DELETE', `/${noteId}/pin`)).statusCode).toBe(200);

      const cleared = await noteApi(otherMember, householdId, 'PUT', `/${noteId}/labels`, { labelIds: [] });
      expect(cleared.statusCode).toBe(200);
      const stored = (await noteApi(owner, householdId, 'GET', `/${noteId}`)).json();
      expect(stored).toMatchObject({ pinnedAt: null, labels: [], createdBy: owner.userId });
    });

    test('pinning and relabelling are not edits: the version and last editor stay, and a save on the old version succeeds', async () => {
      const noteId = await createNote(member, householdId, { title: '周末采购', body: '- [ ] 牛奶' });
      const label = await createLabel(householdId, '采购');
      const base = (await noteApi(member, householdId, 'GET', `/${noteId}`)).json();

      const pinned = await noteApi(otherMember, householdId, 'PUT', `/${noteId}/pin`);
      const relabelled = await noteApi(admin, householdId, 'PUT', `/${noteId}/labels`, { labelIds: [label] });
      expect([pinned.statusCode, relabelled.statusCode]).toEqual([200, 200]);
      for (const response of [pinned, relabelled]) {
        expect(response.json()).toMatchObject({ updatedAt: base.updatedAt, updatedBy: member.userId });
      }
      expect((await noteApi(owner, householdId, 'GET', `/${noteId}`)).json()).toMatchObject({ updatedAt: base.updatedAt, updatedBy: member.userId });

      const save = await noteApi(member, householdId, 'PUT', `/${noteId}`, { body: '- [x] 牛奶', expectedUpdatedAt: base.updatedAt });
      expect(save.statusCode).toBe(200);
      const saved = (await noteApi(owner, householdId, 'GET', `/${noteId}`)).json();
      expect(saved).toMatchObject({ body: '- [x] 牛奶', pinnedAt: pinned.json().pinnedAt });
      expect(labelIdsOf(saved)).toEqual([label]);
    });

    test('a pin does not move the note in the list order', async () => {
      const olderId = await createNote(owner, householdId, { title: '先建的' });
      const newerId = await createNote(owner, householdId, { title: '后建的' });

      expect((await noteApi(member, householdId, 'PUT', `/${olderId}/pin`)).statusCode).toBe(200);

      expect((await noteApi(member, householdId, 'GET')).json().notes.map((note: { id: string }) => note.id)).toEqual([newerId, olderId]);
    });

    test('rejects labels of another household and keeps the note\'s labels', async () => {
      const noteId = await createNote(member, householdId, { title: '只贴本家的标签' });
      const own = await createLabel(householdId, '学校');
      const otherHouseholdId = await createHousehold(owner.accessToken, '第二个家');
      const foreign = await createLabel(otherHouseholdId, '别家的');
      expect((await noteApi(member, householdId, 'PUT', `/${noteId}/labels`, { labelIds: [own] })).statusCode).toBe(200);

      for (const labelIds of [[foreign], [own, foreign], [randomUUID()]]) {
        const response = await noteApi(member, householdId, 'PUT', `/${noteId}/labels`, { labelIds });
        expect(response.statusCode).toBe(400);
        expect(response.json().error.code).toBe('VALIDATION_FAILED');
      }
      const created = await noteApi(member, householdId, 'POST', '', { title: '新建也不行', labelIds: [foreign] });
      expect(created.statusCode).toBe(400);
      expect(created.json().error.code).toBe('VALIDATION_FAILED');

      expect(labelIdsOf((await noteApi(member, householdId, 'GET', `/${noteId}`)).json())).toEqual([own]);
      expect((await noteApi(member, householdId, 'GET')).json().notes.map((note: { title: string }) => note.title)).toEqual(['只贴本家的标签']);
    });

    test.each([
      ['a missing list', {}],
      ['a non-array', { labelIds: 'all' }],
      ['a malformed id', { labelIds: ['not-a-uuid'] }],
    ])('rejects %s of labels', async (_name, payload) => {
      const noteId = await createNote(member, householdId, { title: '标签格式' });

      const response = await noteApi(member, householdId, 'PUT', `/${noteId}/labels`, payload);

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_FAILED');
    });

    test('a new note is written with its labels and pin together', async () => {
      const label = await createLabel(householdId, '学校');

      const created = await noteApi(member, householdId, 'POST', '', { title: '开学要带的', labelIds: [label], pinned: true });

      expect(created.statusCode).toBe(201);
      const stored = (await noteApi(owner, householdId, 'GET', `/${created.json().id}`)).json();
      expect(Date.parse(stored.pinnedAt)).not.toBeNaN();
      expect(labelIdsOf(stored)).toEqual([label]);
      const plain = await noteApi(member, householdId, 'POST', '', { title: '普通的', pinned: false });
      expect(plain.json()).toMatchObject({ pinnedAt: null, labels: [] });
    });

    test('deleting a label keeps the notes that carried it', async () => {
      const [school, shopping] = await Promise.all([createLabel(householdId, '学校'), createLabel(householdId, '采购')]);
      const noteId = await createNote(member, householdId, { title: '带两个标签', labelIds: [school, shopping] });

      const removed = await request(owner.accessToken, 'DELETE', `/households/${householdId}/labels/${school}`);

      expect(removed.statusCode).toBe(204);
      const stored = (await noteApi(member, householdId, 'GET', `/${noteId}`)).json();
      expect(stored.title).toBe('带两个标签');
      expect(labelIdsOf(stored)).toEqual([shopping]);
    });

    test('non-members get HOUSEHOLD_NOT_FOUND and change nothing', async () => {
      const label = await createLabel(householdId, '学校');
      const noteId = await createNote(owner, householdId, { title: '私密笔记' });

      const responses = await Promise.all([
        noteApi(outsider, householdId, 'PUT', `/${noteId}/pin`),
        noteApi(outsider, householdId, 'DELETE', `/${noteId}/pin`),
        noteApi(outsider, householdId, 'PUT', `/${noteId}/labels`, { labelIds: [label] }),
      ]);

      for (const response of responses) {
        expect(response.statusCode).toBe(404);
        expect(response.json().error.code).toBe('HOUSEHOLD_NOT_FOUND');
      }
      expect((await noteApi(owner, householdId, 'GET', `/${noteId}`)).json()).toMatchObject({ pinnedAt: null, labels: [] });
    });

    test('a note cannot be pinned or relabelled through another household', async () => {
      const noteId = await createNote(owner, householdId, { title: '只属于笔记组' });
      const otherHouseholdId = await createHousehold(owner.accessToken, '第二个家');

      const responses = await Promise.all([
        noteApi(owner, otherHouseholdId, 'PUT', `/${noteId}/pin`),
        noteApi(owner, otherHouseholdId, 'DELETE', `/${noteId}/pin`),
        noteApi(owner, otherHouseholdId, 'PUT', `/${noteId}/labels`, { labelIds: [] }),
        noteApi(owner, householdId, 'PUT', `/${randomUUID()}/pin`),
      ]);

      for (const response of responses) {
        expect(response.statusCode).toBe(404);
        expect(response.json().error.code).toBe('NOTE_NOT_FOUND');
      }
      expect((await noteApi(owner, householdId, 'GET', `/${noteId}`)).json().pinnedAt).toBeNull();
    });
  });

  describe('permissions', () => {
    test.each([
      ['member', () => otherMember],
      ['admin', () => admin],
      ['owner', () => owner],
    ])('members can edit but cannot delete notes created by another %s', async (_role, creator) => {
      const noteId = await createNote(creator(), householdId, { title: '别人的笔记' });

      const update = await noteApi(member, householdId, 'PUT', `/${noteId}`, { title: '共同编辑', body: '补充内容' });
      const remove = await noteApi(member, householdId, 'DELETE', `/${noteId}`);

      expect(update.statusCode).toBe(200);
      expect(remove.statusCode).toBe(403);
      expect(remove.json().error.code).toBe('FORBIDDEN');
      expect((await noteApi(member, householdId, 'GET', `/${noteId}`)).json()).toMatchObject({ title: '共同编辑', body: '补充内容', createdBy: creator().userId });
    });

    test.each([
      ['admin', () => admin],
      ['owner', () => owner],
    ])('%s can edit and delete a member note', async (_role, actor) => {
      const noteId = await createNote(member, householdId, { title: '成员笔记' });

      const update = await noteApi(actor(), householdId, 'PUT', `/${noteId}`, { title: '已整理' });
      expect(update.statusCode).toBe(200);
      expect(update.json()).toMatchObject({ title: '已整理', createdBy: member.userId });

      const remove = await noteApi(actor(), householdId, 'DELETE', `/${noteId}`);
      expect(remove.statusCode).toBe(204);
    });

    test('non-members get HOUSEHOLD_NOT_FOUND for every operation', async () => {
      const noteId = await createNote(owner, householdId, { title: '私密笔记' });

      const responses = await Promise.all([
        noteApi(outsider, householdId, 'POST', '', { title: '闯入' }),
        noteApi(outsider, householdId, 'GET'),
        noteApi(outsider, householdId, 'GET', `/${noteId}`),
        noteApi(outsider, householdId, 'PUT', `/${noteId}`, { title: '闯入' }),
        noteApi(outsider, householdId, 'DELETE', `/${noteId}`),
      ]);

      for (const response of responses) {
        expect(response.statusCode).toBe(404);
        expect(response.json().error.code).toBe('HOUSEHOLD_NOT_FOUND');
      }
      expect((await noteApi(owner, householdId, 'GET', `/${noteId}`)).json().title).toBe('私密笔记');
    });

    test('a note cannot be reached through another household', async () => {
      const noteId = await createNote(owner, householdId, { title: '只属于笔记组' });
      const otherHouseholdId = await createHousehold(owner.accessToken, '第二个家');

      const responses = await Promise.all([
        noteApi(owner, otherHouseholdId, 'GET', `/${noteId}`),
        noteApi(owner, otherHouseholdId, 'PUT', `/${noteId}`, { title: '越界' }),
        noteApi(owner, otherHouseholdId, 'DELETE', `/${noteId}`),
      ]);

      for (const response of responses) {
        expect(response.statusCode).toBe(404);
        expect(response.json().error.code).toBe('NOTE_NOT_FOUND');
      }
      expect((await noteApi(owner, householdId, 'GET', `/${noteId}`)).json().title).toBe('只属于笔记组');
    });

    test('unknown note ids return NOTE_NOT_FOUND', async () => {
      const response = await noteApi(owner, householdId, 'GET', `/${randomUUID()}`);

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NOTE_NOT_FOUND');
    });

    test('malformed path ids are rejected with 400 rather than a driver-level 500', async () => {
      const noteId = await createNote(owner, householdId, { title: '路径检查' });
      const edit = { title: '不应保存', expectedUpdatedAt: new Date().toISOString() };
      const cases: Array<[method: 'GET' | 'PUT' | 'DELETE', household: string, note: string, payload?: unknown]> = [
        ['GET', 'not-a-uuid', noteId],
        ['GET', householdId, 'not-a-uuid'],
        ['PUT', householdId, 'not-a-uuid', edit],
        ['DELETE', householdId, 'not-a-uuid'],
      ];
      for (const [method, household, note, payload] of cases) {
        const response = await noteApi(owner, household, method, `/${note}`, payload);
        expect({ method, household, note, status: response.statusCode }).toEqual({ method, household, note, status: 400 });
      }
      expect((await noteApi(owner, householdId, 'GET', `/${noteId}`)).json().title).toBe('路径检查');
    });

    test('requests without an access token are rejected', async () => {
      const response = await (app.getHttpAdapter().getInstance() as any).inject({
        method: 'GET',
        url: `/api/v1/households/${householdId}/notes`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  test('notes are removed when their household is deleted', async () => {
    await createNote(owner, householdId, { title: '随家庭删除' });

    await withDatabase((client) => client.query(`DELETE FROM "households" WHERE "id" = $1`, [householdId]));

    const remaining = await withDatabase((client) => client.query(`SELECT count(*)::int AS n FROM "notes"`));
    expect(remaining.rows[0].n).toBe(0);
  });
});
