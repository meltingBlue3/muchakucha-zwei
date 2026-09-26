import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';
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

interface MemberFixture {
  accessToken: string;
  username: string;
  id: string;
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

async function insertUser(username: string, displayName: string): Promise<MemberFixture> {
  const userId = randomUUID();
  const sessionId = randomUUID();
  const passwordHash = await argon2.hash('test-password-for-e2e-only', {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  await withDatabase(async (client) => {
    await client.query(
      `INSERT INTO "User" ("id", "username", "username_canonical", "display_name", "password_hash")
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, username, username.trim().normalize('NFC').toLowerCase(), displayName, passwordHash],
    );
    await client.query(
      `INSERT INTO "AuthSession" ("id", "user_id", "absolute_ends_at")
       VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '30 days')`,
      [sessionId, userId],
    );
  });
  return {
    id: userId,
    username,
    accessToken: await jwt.signAsync({ sub: userId, sid: sessionId }),
  };
}

let app: NestFastifyApplication;
let owner: MemberFixture;
let invitee: MemberFixture;
let stranger: MemberFixture;
let household: { id: string };
const base = '/api/v1/households';
beforeAll(async () => {
  app = await createApplication({ ...process.env, NODE_ENV: 'test', E2E_DISABLE_RATE_LIMITS: 'true', JWT_ACCESS_SECRET: accessSecret, DATABASE_URL: getTestDatabaseUrl() });
  await app.init(); await app.getHttpAdapter().getInstance().ready();
});
afterAll(async () => { await app.close(); });
beforeEach(async () => {
  await resetDatabase();
  owner = await insertUser('owner', '家主'); invitee = await insertUser('invitee', '被邀请人'); stranger = await insertUser('stranger', '陌生人');
  const response = await request(owner, 'POST', base, { name: '温暖小家' });
  expect(response.statusCode).toBe(201); household = response.json();
});
function request(actor: MemberFixture | null, method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>) {
  return app.inject({ method, url, ...(actor ? { headers: { authorization: `Bearer ${actor.accessToken}` } } : {}), ...(payload ? { payload } : {}) });
}
async function send() {
  const response = await request(owner, 'POST', `${base}/${household.id}/invitations`, { username: ' INVITEE ' });
  expect(response.statusCode).toBe(201);
  expect(response.json()).not.toHaveProperty('invitationUrl');
  return response.json<{ invitationId: string }>().invitationId;
}
async function inbox(actor = invitee) { return request(actor, 'GET', `${base}/invitations/inbox`); }
async function respond(id: string, action = 'accept', actor = invitee) { return request(actor, 'POST', `${base}/invitations/${action}`, { invitationId: id }); }
const prisma = () => app.get(PrismaService);

describe('account invitation inbox', () => {
  test('delivers to the registered recipient without a bearer link and accepts as MEMBER', async () => {
    const id = await send();
    expect((await inbox()).json().invitations).toEqual([expect.objectContaining({ id, householdName: '温暖小家', inviterDisplayName: '家主' })]);
    expect((await inbox(stranger)).json().invitations).toEqual([]);
    expect((await respond(id)).statusCode).toBe(200);
    expect((await inbox()).json().invitations).toEqual([]);
    expect(await prisma().membership.findFirst({ where: { householdId: household.id, userId: invitee.id } })).toMatchObject({ role: 'MEMBER' });
  });
  test('declining creates no membership and records declined for the sender', async () => {
    const id = await send(); expect((await respond(id, 'decline')).statusCode).toBe(204);
    expect((await inbox()).json().invitations).toEqual([]);
    expect(await prisma().membership.count({ where: { userId: invitee.id } })).toBe(0);
    const list = await request(owner, 'GET', `${base}/${household.id}/invitations`);
    expect(list.json().invitations[0].status).toBe('declined');
    expect((await respond(id)).statusCode).toBe(409);
  });
  test.each(['accept', 'decline'])('rejects another account attempting to %s', async action => {
    const id = await send(); expect((await respond(id, action, stranger)).statusCode).toBe(404);
    const record = await prisma().invitation.findUniqueOrThrow({ where: { id } });
    expect(record.consumedAt).toBeNull(); expect(record.declinedAt).toBeNull();
    expect((await inbox()).json().invitations).toHaveLength(1);
  });
  test('requires authentication and removes the public preview', async () => {
    expect((await request(null, 'GET', `${base}/invitations/inbox`)).statusCode).toBe(401);
    expect((await request(null, 'POST', `${base}/invitations/accept`, { invitationId: randomUUID() })).statusCode).toBe(401);
    expect((await request(null, 'GET', `${base}/invitations/preview?token=anything`)).statusCode).toBe(404);
  });
  test('rejects malformed ids and the removed token contract', async () => {
    for (const body of [{ invitationId: 'bad' }, { token: 'old-link' }, {}]) {
      expect((await request(invitee, 'POST', `${base}/invitations/accept`, body)).statusCode).toBe(400);
    }
  });
  test.each(['expired', 'revoked', 'accepted', 'declined'])('%s invitations cannot be acted on again', async status => {
    const id = await send();
    if (status === 'expired') await prisma().invitation.update({ where: { id }, data: { createdAt: new Date(Date.now() - 8 * 86400000), expiresAt: new Date(Date.now() - 86400000) } });
    if (status === 'revoked') expect((await request(owner, 'POST', `${base}/${household.id}/invitations/${id}/revoke`)).statusCode).toBe(200);
    if (status === 'accepted') await respond(id);
    if (status === 'declined') await respond(id, 'decline');
    expect((await inbox()).json().invitations).toEqual([]);
    expect((await respond(id)).statusCode).toBe(409);
    expect((await respond(id, 'decline')).statusCode).toBe(409);
  });
  test('resending replaces the pending item and refreshes expiry', async () => {
    const old = await send();
    const resent = await request(owner, 'POST', `${base}/${household.id}/invitations/${old}/resend`);
    expect(resent.statusCode).toBe(200);
    expect((await inbox()).json().invitations.map((item: { id: string }) => item.id)).toEqual([resent.json().invitationId]);
    expect((await respond(old)).statusCode).toBe(409);
  });
  test('concurrent sends leave only one pending invitation', async () => {
    await Promise.all([send(), send()]);
    expect((await inbox()).json().invitations).toHaveLength(1);
  });
  test('accept and decline racing produce exactly one final outcome', async () => {
    const id = await send();
    const results = await Promise.all([respond(id), respond(id, 'decline')]);
    expect(results.filter(r => r.statusCode === 409)).toHaveLength(1);
    const record = await prisma().invitation.findUniqueOrThrow({ where: { id } });
    expect(Number(record.consumedAt !== null) + Number(record.declinedAt !== null)).toBe(1);
    expect(await prisma().membership.count({ where: { userId: invitee.id } })).toBe(record.consumedAt ? 1 : 0);
  });
  test('concurrent accept claims only once', async () => {
    const id = await send(); const results = await Promise.all([respond(id), respond(id)]);
    expect(results.map(r => r.statusCode).sort()).toEqual([200, 409]);
    expect(await prisma().membership.count({ where: { userId: invitee.id } })).toBe(1);
  });
  test('accept racing revoke never creates membership for a revoked invite', async () => {
    const id = await send();
    await Promise.all([respond(id), request(owner, 'POST', `${base}/${household.id}/invitations/${id}/revoke`)]);
    const record = await prisma().invitation.findUniqueOrThrow({ where: { id } });
    expect(record.consumedAt === null || record.invalidatedAt === null).toBe(true);
    expect(await prisma().membership.count({ where: { userId: invitee.id } })).toBe(record.consumedAt ? 1 : 0);
  });
  test('member and outsider cannot send or manage invitations', async () => {
    await prisma().membership.create({ data: { householdId: household.id, userId: invitee.id, role: 'MEMBER' } });
    for (const [actor, status] of [[invitee, 403], [stranger, 404]] as const) {
      expect((await request(actor, 'POST', `${base}/${household.id}/invitations`, { username: stranger.username })).statusCode).toBe(status);
      expect((await request(actor, 'GET', `${base}/${household.id}/invitations`)).statusCode).toBe(status);
    }
    expect(await prisma().invitation.count()).toBe(0);
  });
  test('admin can invite and existing members cannot be invited', async () => {
    await prisma().membership.create({ data: { householdId: household.id, userId: stranger.id, role: 'ADMIN' } });
    expect((await request(stranger, 'POST', `${base}/${household.id}/invitations`, { username: invitee.username })).statusCode).toBe(201);
    expect((await request(owner, 'POST', `${base}/${household.id}/invitations`, { username: stranger.username })).statusCode).toBe(409);
  });
  test('unknown username does not create an invitation', async () => {
    const response = await request(owner, 'POST', `${base}/${household.id}/invitations`, { username: 'unknown' });
    expect(response.statusCode).toBe(400); expect(response.json().error.code).toBe('INVITATION_USER_NOT_FOUND');
    expect(await prisma().invitation.count()).toBe(0);
  });
});
