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

async function insertActor(email: string, displayName: string): Promise<ActorFixture> {
  const userId = randomUUID();
  const sessionId = randomUUID();
  await withDatabase(async (client) => {
    await client.query(
      `INSERT INTO "User" ("id", "email", "email_canonical", "display_name", "password_hash", "email_verified_at")
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [userId, email, email.toLowerCase(), displayName, passwordHash],
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      insertActor('owner-notes@example.test', '笔记主人'),
      insertActor('admin-notes@example.test', '笔记管理员'),
      insertActor('member-notes@example.test', '笔记成员'),
      insertActor('other-notes@example.test', '另一位成员'),
      insertActor('outsider-notes@example.test', '无关人员'),
    ]);
    householdId = await createHousehold(owner.accessToken, '笔记组');
    await addMemberViaDb(householdId, admin, 'ADMIN');
    await addMemberViaDb(householdId, member, 'MEMBER');
    await addMemberViaDb(householdId, otherMember, 'MEMBER');
  });

  test('creates a note with trimmed title and body', async () => {
    const response = await noteApi(member, householdId, 'POST', '', {
      title: '  购物清单  ',
      body: '  牛奶\n鸡蛋  ',
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({
      householdId,
      title: '购物清单',
      body: '牛奶\n鸡蛋',
      createdBy: member.userId,
    });
    expect(body.id).toEqual(expect.any(String));
    expect(Date.parse(body.createdAt)).not.toBeNaN();
    expect(Date.parse(body.updatedAt)).not.toBeNaN();
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

  describe('permissions', () => {
    test('members cannot edit or delete notes created by someone else', async () => {
      const noteId = await createNote(otherMember, householdId, { title: '别人的笔记' });

      const update = await noteApi(member, householdId, 'PUT', `/${noteId}`, { title: '改掉' });
      const remove = await noteApi(member, householdId, 'DELETE', `/${noteId}`);

      expect(update.statusCode).toBe(403);
      expect(update.json().error.code).toBe('FORBIDDEN');
      expect(remove.statusCode).toBe(403);
      expect(remove.json().error.code).toBe('FORBIDDEN');
      expect((await noteApi(member, householdId, 'GET', `/${noteId}`)).json().title).toBe('别人的笔记');
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

    test('requests without an access token are rejected', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
