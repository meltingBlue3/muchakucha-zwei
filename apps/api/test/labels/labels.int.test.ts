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

async function createTask(actor: ActorFixture, householdId: string, title: string): Promise<string> {
  const response = await householdApi(actor, householdId, 'POST', '/tasks', { title });
  expect(response.statusCode).toBe(201);
  return (response.json() as { id: string }).id;
}

async function createEvent(actor: ActorFixture, householdId: string, title: string): Promise<string> {
  const start = new Date(Date.now() + 86_400_000);
  const end = new Date(start.getTime() + 3_600_000);
  const response = await householdApi(actor, householdId, 'POST', '/events', {
    title,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  });
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
      insertActor('owner-labels@example.test', '标签主人'),
      insertActor('admin-labels@example.test', '标签管理员'),
      insertActor('member-labels@example.test', '标签成员'),
      insertActor('outsider-labels@example.test', '无关人员'),
    ]);
    householdId = await createHousehold(owner.accessToken, '标签组');
    await addMemberViaDb(householdId, admin, 'ADMIN');
    await addMemberViaDb(householdId, member, 'MEMBER');
  });

  describe('label management', () => {
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
      const taskId = await createTask(owner, householdId, '带标签的任务');
      const eventId = await createEvent(owner, householdId, '带标签的活动');
      await householdApi(owner, householdId, 'POST', `/tasks/${taskId}/labels`, { labelIds: [labelId, keepId] });
      await householdApi(owner, householdId, 'POST', `/events/${eventId}/labels`, { labelIds: [labelId, keepId] });

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

  describe.each([
    ['tasks', createTask, 'TASK_NOT_FOUND'],
    ['events', createEvent, 'EVENT_NOT_FOUND'],
  ] as const)('tagging %s', (collection, createEntity, notFoundCode) => {
    let schoolId: string;
    let sportId: string;
    let medicalId: string;

    beforeEach(async () => {
      schoolId = await createLabel(owner, householdId, '学校', '#3B82F6');
      sportId = await createLabel(owner, householdId, '运动', '#10B981');
      medicalId = await createLabel(owner, householdId, '医疗', '#EF4444');
    });

    test('members can tag, and the label set replaces the previous one', async () => {
      const entityId = await createEntity(owner, householdId, '要打标签');
      const path = `/${collection}/${entityId}`;

      const first = await householdApi(member, householdId, 'POST', `${path}/labels`, { labelIds: [schoolId, sportId] });
      expect(first.statusCode).toBe(204);
      const tagged = await householdApi(member, householdId, 'GET', path);
      expect(tagged.json().labels).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: schoolId, name: '学校', color: '#3B82F6', householdId }),
          expect.objectContaining({ id: sportId, name: '运动', color: '#10B981' }),
        ]),
      );
      expect(tagged.json().labels).toHaveLength(2);

      const replaced = await householdApi(member, householdId, 'POST', `${path}/labels`, { labelIds: [sportId, medicalId] });
      expect(replaced.statusCode).toBe(204);
      expect(await labelNamesOf(member, householdId, path)).toEqual(['医疗', '运动']);

      const cleared = await householdApi(member, householdId, 'POST', `${path}/labels`, { labelIds: [] });
      expect(cleared.statusCode).toBe(204);
      expect(await labelNamesOf(member, householdId, path)).toEqual([]);
    });

    test('tagging is idempotent', async () => {
      const entityId = await createEntity(owner, householdId, '重复打标签');
      const path = `/${collection}/${entityId}`;

      await householdApi(owner, householdId, 'POST', `${path}/labels`, { labelIds: [schoolId] });
      const again = await householdApi(owner, householdId, 'POST', `${path}/labels`, { labelIds: [schoolId] });

      expect(again.statusCode).toBe(204);
      expect(await labelNamesOf(owner, householdId, path)).toEqual(['学校']);
    });

    test('untag removes one label and is a no-op when it is not attached', async () => {
      const entityId = await createEntity(owner, householdId, '取消标签');
      const path = `/${collection}/${entityId}`;
      await householdApi(owner, householdId, 'POST', `${path}/labels`, { labelIds: [schoolId, sportId] });

      const removed = await householdApi(member, householdId, 'DELETE', `${path}/labels/${schoolId}`);
      expect(removed.statusCode).toBe(204);
      expect(await labelNamesOf(owner, householdId, path)).toEqual(['运动']);

      const again = await householdApi(member, householdId, 'DELETE', `${path}/labels/${schoolId}`);
      expect(again.statusCode).toBe(204);
      expect(await labelNamesOf(owner, householdId, path)).toEqual(['运动']);
    });

    test('rejects labels from another household without changing existing tags', async () => {
      const entityId = await createEntity(owner, householdId, '混入外部标签');
      const path = `/${collection}/${entityId}`;
      await householdApi(owner, householdId, 'POST', `${path}/labels`, { labelIds: [schoolId] });
      const otherHouseholdId = await createHousehold(outsider.accessToken, '别人的家');
      const foreignLabelId = await createLabel(outsider, otherHouseholdId, '外部');

      const response = await householdApi(owner, householdId, 'POST', `${path}/labels`, {
        labelIds: [sportId, foreignLabelId],
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_FAILED');
      expect(await labelNamesOf(owner, householdId, path)).toEqual(['学校']);
    });

    test('rejects unknown, malformed, and non-array label ids', async () => {
      const entityId = await createEntity(owner, householdId, '无效标签');
      const path = `/${collection}/${entityId}`;

      const unknown = await householdApi(owner, householdId, 'POST', `${path}/labels`, { labelIds: [randomUUID()] });
      expect(unknown.statusCode).toBe(400);

      const malformed = await householdApi(owner, householdId, 'POST', `${path}/labels`, { labelIds: ['not-a-uuid'] });
      expect(malformed.statusCode).toBe(400);
      expect(malformed.json().error.code).toBe('VALIDATION_FAILED');

      const notArray = await householdApi(owner, householdId, 'POST', `${path}/labels`, { labelIds: schoolId });
      expect(notArray.statusCode).toBe(400);
      expect(notArray.json().error.code).toBe('VALIDATION_FAILED');
    });

    test(`returns ${notFoundCode} for unknown or cross-household ${collection}`, async () => {
      const otherHouseholdId = await createHousehold(owner.accessToken, '第二个家');
      const foreignEntityId = await createEntity(owner, otherHouseholdId, '别的家的');

      const responses = await Promise.all([
        householdApi(owner, householdId, 'POST', `/${collection}/${randomUUID()}/labels`, { labelIds: [schoolId] }),
        householdApi(owner, householdId, 'POST', `/${collection}/${foreignEntityId}/labels`, { labelIds: [schoolId] }),
        householdApi(owner, householdId, 'DELETE', `/${collection}/${foreignEntityId}/labels/${schoolId}`),
      ]);

      for (const response of responses) {
        expect(response.statusCode).toBe(404);
        expect(response.json().error.code).toBe(notFoundCode);
      }
    });

    test('non-members cannot tag or untag', async () => {
      const entityId = await createEntity(owner, householdId, '外人不可改');
      const path = `/${collection}/${entityId}`;
      await householdApi(owner, householdId, 'POST', `${path}/labels`, { labelIds: [schoolId] });

      const tag = await householdApi(outsider, householdId, 'POST', `${path}/labels`, { labelIds: [sportId] });
      const untag = await householdApi(outsider, householdId, 'DELETE', `${path}/labels/${schoolId}`);

      expect(tag.statusCode).toBe(404);
      expect(tag.json().error.code).toBe('HOUSEHOLD_NOT_FOUND');
      expect(untag.statusCode).toBe(404);
      expect(untag.json().error.code).toBe('HOUSEHOLD_NOT_FOUND');
      expect(await labelNamesOf(owner, householdId, path)).toEqual(['学校']);
    });
  });
});
