import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { createApplication } from '../../src/main.js';
import { AssistantProvider } from '../../src/modules/assistant/assistant-provider.js';
import { AssistantProviderFailure } from '../../src/modules/assistant/assistant-transport.js';
import type { AssistantCompletion } from '../../src/modules/assistant/assistant.types.js';
import type { AssistantConversationResponseDto, AssistantProviderResponseDto } from '../../src/modules/assistant/dto/assistant.dto.js';
import { getTestDatabaseUrl, resetDatabase } from '../reset-database.js';

const accessSecret = 'assistant-test-access-secret-longer-than-thirty-two-bytes';
const providerSecret = 'sk-assistant-fixture-secret-never-return-this';
const jwt = new JwtService({ secret: accessSecret, signOptions: { algorithm: 'HS256', expiresIn: 15 * 60 } });
const complete = vi.fn<AssistantProvider['complete']>();
let app: NestFastifyApplication;
let passwordHash: string;

interface ActorFixture { accessToken: string; userId: string }
interface ApiResponse {
  statusCode: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: () => any;
}

async function withDatabase<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: getTestDatabaseUrl() });
  await client.connect();
  try { return await run(client); } finally { await client.end(); }
}

async function insertActor(username: string): Promise<ActorFixture> {
  const userId = randomUUID();
  const sessionId = randomUUID();
  await withDatabase(async (client) => {
    await client.query(
      'INSERT INTO "User" ("id", "username", "username_canonical", "display_name", "password_hash") VALUES ($1, $2, $2, $2, $3)',
      [userId, username, passwordHash],
    );
    await client.query(
      'INSERT INTO "AuthSession" ("id", "user_id", "absolute_ends_at") VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL \'30 days\')',
      [sessionId, userId],
    );
  });
  return { userId, accessToken: await jwt.signAsync({ sub: userId, sid: sessionId }) };
}

async function request(actor: ActorFixture, method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, payload?: unknown): Promise<ApiResponse> {
  return app.getHttpAdapter().getInstance().inject({
    method,
    url: `/api/v1${path}`,
    headers: { authorization: `Bearer ${actor.accessToken}`, ...(payload === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
  });
}

async function createHousehold(actor: ActorFixture, name = '助手家庭'): Promise<string> {
  const response = await request(actor, 'POST', '/households', { name });
  expect(response.statusCode).toBe(201);
  return response.json().id as string;
}

async function addMember(householdId: string, actor: ActorFixture): Promise<void> {
  await withDatabase(async (client) => {
    await client.query('INSERT INTO "memberships" ("user_id", "household_id", "role") VALUES ($1, $2, \'MEMBER\')', [actor.userId, householdId]);
  });
}

function assistant(actor: ActorFixture, householdId: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, payload?: unknown) {
  return request(actor, method, `/households/${householdId}/assistant${path}`, payload);
}

async function createProvider(actor: ActorFixture, householdId: string, visibility: 'private' | 'household' = 'private'): Promise<AssistantProviderResponseDto> {
  const response = await assistant(actor, householdId, 'POST', '/providers', {
    name: '家庭模型', protocol: 'openai-compatible', baseUrl: 'https://api.example.com/v1', model: 'test-tool-model', visibility, apiKey: providerSecret,
  });
  expect(response.statusCode).toBe(201);
  return response.json() as AssistantProviderResponseDto;
}

async function createConversation(actor: ActorFixture, householdId: string, providerId: string): Promise<AssistantConversationResponseDto> {
  const response = await assistant(actor, householdId, 'POST', '/conversations', { providerId });
  expect(response.statusCode).toBe(201);
  return response.json() as AssistantConversationResponseDto;
}

function send(actor: ActorFixture, householdId: string, conversation: AssistantConversationResponseDto, message = '请帮我处理家庭事项') {
  return assistant(actor, householdId, 'POST', `/conversations/${conversation.id}/messages`, {
    message, timeZone: 'Asia/Shanghai', expectedVersion: conversation.version,
  });
}

/** Approves every pending action, or declines them all. */
function decide(actor: ActorFixture, householdId: string, conversation: AssistantConversationResponseDto, approve = true) {
  const approvedIds = approve ? conversation.pendingActions.map(action => action.id) : [];
  return assistant(actor, householdId, 'POST', `/conversations/${conversation.id}/decision`, { approvedIds, expectedVersion: conversation.version });
}

function tool(name: string, args: Record<string, unknown>): AssistantCompletion {
  return { content: '', toolCalls: [{ id: `call_${randomUUID()}`, name, arguments: args }] };
}

async function notes(actor: ActorFixture, householdId: string) {
  const response = await request(actor, 'GET', `/households/${householdId}/notes`);
  expect(response.statusCode).toBe(200);
  return response.json() as { notes: { id: string; title: string; body: string | null; updatedAt: string; createdBy: string }[]; total: number };
}

beforeAll(async () => {
  passwordHash = await argon2.hash('assistant-fixture-password', { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  app = await createApplication({
    ...process.env,
    NODE_ENV: 'test', E2E_DISABLE_RATE_LIMITS: 'true', JWT_ACCESS_SECRET: accessSecret, DATABASE_URL: getTestDatabaseUrl(),
    ASSISTANT_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  });
  vi.spyOn(app.get(AssistantProvider), 'complete').mockImplementation((...args) => complete(...args));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => { await app?.close(); });
beforeEach(async () => {
  complete.mockReset();
  complete.mockResolvedValue({ content: '已根据工具结果完成处理。', toolCalls: [] });
  await resetDatabase();
});

describe('assistant configuration, conversation isolation, and confirmed tools', () => {
  let owner: ActorFixture;
  let member: ActorFixture;
  let outsider: ActorFixture;
  let householdId: string;

  beforeEach(async () => {
    [owner, member, outsider] = await Promise.all([insertActor('assistant-owner'), insertActor('assistant-member'), insertActor('assistant-outsider')]);
    householdId = await createHousehold(owner);
    await addMember(householdId, member);
  });

  test('stores encrypted credentials and returns only credential availability', async () => {
    const provider = await createProvider(owner, householdId);
    expect(provider).toMatchObject({ hasCredential: true, ownedByMe: true, visibility: 'private' });
    expect(provider).not.toHaveProperty('apiKey');
    expect(provider).not.toHaveProperty('encryptedApiKey');
    const list = await assistant(owner, householdId, 'GET', '/providers');
    expect(JSON.stringify(list.json())).not.toContain(providerSecret);
    const row = await withDatabase(async (client) => (await client.query<{ encrypted_api_key: string }>(
      'SELECT encrypted_api_key FROM assistant_providers WHERE id = $1', [provider.id],
    )).rows[0]);
    expect(row?.encrypted_api_key).toMatch(/^v1\./);
    expect(row?.encrypted_api_key).not.toContain(providerSecret);
    const conversation = await createConversation(owner, householdId, provider.id);
    expect((await send(owner, householdId, conversation)).statusCode).toBe(200);
    expect(complete.mock.calls[0]?.[0].apiKey).toBe(providerSecret);
    expect(JSON.stringify(complete.mock.calls[0]?.slice(1))).not.toContain(providerSecret);
  });

  test('a connection check runs one harmless tool round trip and never sends household data', async () => {
    const form = { protocol: 'openai-compatible', baseUrl: 'https://api.example.com/v1/', model: 'test-tool-model' };
    complete.mockResolvedValueOnce({ ...tool('connection_check', {}), replay: { reasoning_content: '调用检查工具。' } });
    const typed = await assistant(member, householdId, 'POST', '/providers/check', { ...form, apiKey: 'sk-typed-into-the-form' });
    expect(typed.statusCode).toBe(200);
    expect(typed.json()).toEqual({ toolCalling: true });
    const [config, , messages, definitions] = complete.mock.calls[0]!;
    expect(config).toEqual({ protocol: 'openai-compatible', baseUrl: 'https://api.example.com/v1', model: 'test-tool-model', apiKey: 'sk-typed-into-the-form' });
    expect(messages).toEqual([{ role: 'user', content: 'connection check' }]);
    expect(definitions.map(definition => definition.name)).toEqual(['connection_check']);
    // The result goes back in a second request, carrying what the model needs returned, as every run step does.
    expect(complete.mock.calls[1]?.[2]).toEqual([messages[0],
      { role: 'assistant', content: '', toolCalls: [expect.objectContaining({ name: 'connection_check' })], replay: { reasoning_content: '调用检查工具。' } },
      { role: 'tool', toolCallId: expect.any(String), content: expect.stringContaining('"connected":true') },
    ]);

    // A text-only reply connects but cannot drive the assistant's tools.
    const provider = await createProvider(owner, householdId, 'household');
    complete.mockResolvedValueOnce({ content: '你好', toolCalls: [] });
    const saved = await assistant(owner, householdId, 'POST', '/providers/check', { ...form, providerId: provider.id });
    expect(saved.json()).toEqual({ toolCalling: false });
    expect(complete.mock.calls[2]?.[0].apiKey).toBe(providerSecret);

    // A service that takes the call but refuses the follow-up fails the check before the configuration is used.
    complete.mockResolvedValueOnce(tool('connection_check', {})).mockRejectedValueOnce(new AssistantProviderFailure('ASSISTANT_PROVIDER_REJECTED', 'The model provider rejected the request.', 'status 400'));
    const followUp = await assistant(owner, householdId, 'POST', '/providers/check', { ...form, providerId: provider.id });
    expect(followUp.statusCode).toBe(502);
    expect(followUp.json().error.code).toBe('ASSISTANT_PROVIDER_FOLLOW_UP_REJECTED');

    // Sharing a configuration never lends its saved key to another member's check.
    const borrowed = await assistant(member, householdId, 'POST', '/providers/check', { ...form, baseUrl: 'https://collector.example.com/v1', providerId: provider.id });
    expect(borrowed.statusCode).toBe(403);
    expect((await assistant(owner, householdId, 'POST', '/providers/check', form)).statusCode).toBe(400);
    expect((await assistant(outsider, householdId, 'POST', '/providers/check', { ...form, apiKey: 'sk-outsider' })).statusCode).toBe(404);
    expect((await assistant(owner, householdId, 'POST', '/providers/check', { ...form, baseUrl: 'https://10.0.0.1/v1', apiKey: 'sk-test' })).json().error.code).toBe('ASSISTANT_ENDPOINT_INVALID');
    expect(complete).toHaveBeenCalledTimes(5);
  });

  test('starting a conversation replaces an untouched one and keeps every conversation with messages', async () => {
    const provider = await createProvider(owner, householdId, 'household');
    const untouched = await createConversation(owner, householdId, provider.id);
    const used = await createConversation(owner, householdId, provider.id);
    expect((await send(owner, householdId, used, '记得买菜')).statusCode).toBe(200);
    const othersEmpty = await createConversation(member, householdId, provider.id);
    const latest = await createConversation(owner, householdId, provider.id);
    const listed = (await assistant(owner, householdId, 'GET', '/conversations')).json().conversations.map((item: { id: string }) => item.id);
    expect(listed.sort()).toEqual([used.id, latest.id].sort());
    expect((await assistant(owner, householdId, 'GET', `/conversations/${untouched.id}`)).statusCode).toBe(404);
    // Cleanup is per member: another member's empty conversation is not touched.
    expect((await assistant(member, householdId, 'GET', `/conversations/${othersEmpty.id}`)).statusCode).toBe(200);
  });

  test('the owner of a shared configuration sees this month\'s usage by member; members do not', async () => {
    const provider = await createProvider(owner, householdId, 'household');
    complete.mockResolvedValue({ content: '好的。', toolCalls: [], usage: { inputTokens: 1_000, outputTokens: 50 } });
    await send(member, householdId, await createConversation(member, householdId, provider.id));
    const memberConversation = (await assistant(member, householdId, 'GET', '/conversations')).json().conversations[0] as { id: string };
    await send(member, householdId, (await assistant(member, householdId, 'GET', `/conversations/${memberConversation.id}`)).json() as AssistantConversationResponseDto, '再问一次');
    await send(owner, householdId, await createConversation(owner, householdId, provider.id));
    const usage = (await assistant(owner, householdId, 'GET', '/providers')).json().providers[0].usage;
    expect(usage).toMatchObject({ month: new Date().toISOString().slice(0, 7), requests: 3, inputTokens: 3_000, outputTokens: 150 });
    expect(usage.members).toEqual([
      { userId: member.userId, displayName: 'assistant-member', requests: 2, inputTokens: 2_000, outputTokens: 100 },
      { userId: owner.userId, displayName: 'assistant-owner', requests: 1, inputTokens: 1_000, outputTokens: 50 },
    ]);
    expect((await assistant(member, householdId, 'GET', '/providers')).json().providers[0].usage).toBeNull();
  });

  test('a provider failure reaches the check as its stable code', async () => {
    complete.mockRejectedValueOnce(new AssistantProviderFailure('ASSISTANT_PROVIDER_AUTH_FAILED', 'The model provider rejected the credential.', 'status 401'));
    const response = await assistant(owner, householdId, 'POST', '/providers/check', {
      protocol: 'anthropic', baseUrl: 'https://api.example.com/v1', model: 'test-tool-model', apiKey: 'sk-wrong',
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe('ASSISTANT_PROVIDER_AUTH_FAILED');
    expect(JSON.stringify(response.json())).not.toContain('status 401');
  });

  test('private configurations are inaccessible to another member; sharing grants use without management', async () => {
    const provider = await createProvider(owner, householdId);
    expect((await assistant(member, householdId, 'GET', '/providers')).json().providers).toEqual([]);
    expect((await assistant(member, householdId, 'POST', '/conversations', { providerId: provider.id })).statusCode).toBe(404);
    const shared = await assistant(owner, householdId, 'PUT', `/providers/${provider.id}`, { visibility: 'household', expectedUpdatedAt: provider.updatedAt });
    expect(shared.statusCode).toBe(200);
    const list = await assistant(member, householdId, 'GET', '/providers');
    expect(list.json().providers).toEqual([expect.objectContaining({ id: provider.id, ownedByMe: false, hasCredential: true })]);
    expect(JSON.stringify(list.json())).not.toContain(providerSecret);
    await createConversation(member, householdId, provider.id);
    const edit = await assistant(member, householdId, 'PUT', `/providers/${provider.id}`, { name: '擅自改名', expectedUpdatedAt: shared.json().updatedAt });
    expect(edit.statusCode).toBe(403);
    expect((await assistant(member, householdId, 'DELETE', `/providers/${provider.id}`)).statusCode).toBe(403);
    expect((await assistant(owner, householdId, 'GET', '/providers')).json().providers[0].name).toBe('家庭模型');
  });

  test('rejects stale configuration updates without replacing the current configuration', async () => {
    const provider = await createProvider(owner, householdId);
    expect((await assistant(owner, householdId, 'PUT', `/providers/${provider.id}`, { name: '新配置名', expectedUpdatedAt: provider.updatedAt })).statusCode).toBe(200);
    const stale = await assistant(owner, householdId, 'PUT', `/providers/${provider.id}`, { name: '旧页面覆盖', expectedUpdatedAt: provider.updatedAt });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('EDIT_CONFLICT');
    expect((await assistant(owner, householdId, 'GET', '/providers')).json().providers[0].name).toBe('新配置名');
  });

  test('a changed endpoint cannot receive history from an existing shared conversation', async () => {
    const provider = await createProvider(owner, householdId, 'household');
    const conversation = await createConversation(member, householdId, provider.id);
    const previous = await send(member, householdId, conversation, '这是发给旧模型的私人问题');
    expect(previous.statusCode).toBe(200);
    let current = previous.json() as AssistantConversationResponseDto;
    // Renaming, choosing another model or replacing the key keeps the destination, so the conversation continues.
    const renamed = await assistant(owner, householdId, 'PUT', `/providers/${provider.id}`, {
      name: '换了名字', model: 'newer-tool-model', apiKey: 'sk-rotated-key', baseUrl: 'https://api.example.com/v1/', expectedUpdatedAt: provider.updatedAt,
    });
    expect(renamed.statusCode).toBe(200);
    complete.mockClear();
    const continued = await send(member, householdId, current, '继续问');
    expect(continued.statusCode).toBe(200);
    expect(complete.mock.calls[0]?.[0]).toMatchObject({ model: 'newer-tool-model', apiKey: 'sk-rotated-key' });
    current = continued.json() as AssistantConversationResponseDto;
    const changed = await assistant(owner, householdId, 'PUT', `/providers/${provider.id}`, {
      baseUrl: 'https://other.example.com/v1', expectedUpdatedAt: renamed.json().updatedAt,
    });
    expect(changed.statusCode).toBe(200);
    complete.mockClear();
    const blocked = await send(member, householdId, current);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('ASSISTANT_PROVIDER_CHANGED');
    expect(complete).not.toHaveBeenCalled();
  });

  test('requires current household membership for configuration and conversations', async () => {
    const provider = await createProvider(owner, householdId, 'household');
    const conversation = await createConversation(owner, householdId, provider.id);
    for (const path of ['/providers', '/conversations', `/conversations/${conversation.id}`]) {
      expect((await assistant(outsider, householdId, 'GET', path)).statusCode).toBe(404);
    }
    expect((await assistant(outsider, householdId, 'POST', '/conversations', { providerId: provider.id })).statusCode).toBe(404);
    expect(complete).not.toHaveBeenCalled();
  });

  test('keeps shared-provider conversations private and scopes identifiers to the selected household', async () => {
    const provider = await createProvider(owner, householdId, 'household');
    const conversation = await createConversation(owner, householdId, provider.id);
    expect((await assistant(member, householdId, 'GET', '/conversations')).json().conversations).toEqual([]);
    expect((await assistant(member, householdId, 'GET', `/conversations/${conversation.id}`)).statusCode).toBe(404);
    expect((await send(member, householdId, conversation)).statusCode).toBe(404);
    expect((await assistant(member, householdId, 'DELETE', `/conversations/${conversation.id}`)).statusCode).toBe(404);
    const otherHousehold = await createHousehold(owner, '第二个家庭');
    expect((await assistant(owner, otherHousehold, 'POST', '/conversations', { providerId: provider.id })).statusCode).toBe(404);
    expect((await assistant(owner, otherHousehold, 'GET', `/conversations/${conversation.id}`)).statusCode).toBe(404);
    expect((await assistant(owner, householdId, 'GET', `/conversations/${conversation.id}`)).statusCode).toBe(200);
  });

  test('revoking sharing prevents a member from continuing an existing conversation', async () => {
    const provider = await createProvider(owner, householdId, 'household');
    const conversation = await createConversation(member, householdId, provider.id);
    expect((await assistant(owner, householdId, 'PUT', `/providers/${provider.id}`, { visibility: 'private', expectedUpdatedAt: provider.updatedAt })).statusCode).toBe(200);
    const response = await send(member, householdId, conversation);
    expect(response.statusCode).toBe(404);
    expect(complete).not.toHaveBeenCalled();
  });

  test('revoking sharing also prevents approval of a previously proposed write', async () => {
    const provider = await createProvider(owner, householdId, 'household');
    const conversation = await createConversation(member, householdId, provider.id);
    complete.mockResolvedValueOnce(tool('create_note', { title: '撤销共享后的写入' }));
    const proposal = await send(member, householdId, conversation);
    expect(proposal.statusCode).toBe(200);
    expect(proposal.json().pendingActions[0]?.name).toBe('create_note');
    expect((await assistant(owner, householdId, 'PUT', `/providers/${provider.id}`, { visibility: 'private', expectedUpdatedAt: provider.updatedAt })).statusCode).toBe(200);
    expect((await decide(member, householdId, proposal.json() as AssistantConversationResponseDto)).statusCode).toBe(404);
    expect((await notes(owner, householdId)).total).toBe(0);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  test('removing the configuration owner membership removes its credentials and detaches other members conversations', async () => {
    const provider = await createProvider(member, householdId, 'household');
    const conversation = await createConversation(owner, householdId, provider.id);
    await withDatabase(async (client) => { await client.query('DELETE FROM memberships WHERE household_id = $1 AND user_id = $2', [householdId, member.userId]); });
    const persisted = await withDatabase(async (client) => ({
      providers: (await client.query('SELECT id FROM assistant_providers WHERE id = $1', [provider.id])).rows,
      conversations: (await client.query<{ provider_id: string | null }>('SELECT provider_id FROM assistant_conversations WHERE id = $1', [conversation.id])).rows,
    }));
    expect(persisted.providers).toEqual([]);
    expect(persisted.conversations[0]?.provider_id).toBeNull();
    expect((await assistant(member, householdId, 'GET', '/providers')).statusCode).toBe(404);
    expect((await send(owner, householdId, conversation)).statusCode).toBe(404);
    expect(complete).not.toHaveBeenCalled();
  });

  test('queries real household records and supplies results to the model without crossing household boundaries', async () => {
    await request(owner, 'POST', `/households/${householdId}/notes`, { title: '本周采购', body: '牛奶和鸡蛋' });
    const otherHousehold = await createHousehold(outsider, '外部家庭');
    await request(outsider, 'POST', `/households/${otherHousehold}/notes`, { title: '外部秘密', body: '不能出现在查询中' });
    const provider = await createProvider(owner, householdId);
    const conversation = await createConversation(owner, householdId, provider.id);
    complete.mockResolvedValueOnce(tool('list_notes', {}));
    const response = await send(owner, householdId, conversation, '采购笔记里写了什么？');
    expect(response.statusCode).toBe(200);
    expect(complete).toHaveBeenCalledTimes(2);
    const modelContext = JSON.stringify(complete.mock.calls[1]?.[2]);
    expect(modelContext).toContain('本周采购');
    expect(modelContext).not.toContain('外部秘密');
    expect(modelContext).not.toContain('不能出现在查询中');
    expect(response.json().pendingActions).toEqual([]);
    expect((await notes(owner, householdId)).total).toBe(1);
  });

  test('proposes a note without writing and creates it once after approval despite a duplicate decision', async () => {
    const provider = await createProvider(owner, householdId, 'household');
    const conversation = await createConversation(member, householdId, provider.id);
    complete.mockResolvedValueOnce(tool('create_note', { title: '购物清单', body: '牛奶\n鸡蛋' }));
    const proposal = await send(member, householdId, conversation, '记下购物清单：牛奶和鸡蛋');
    expect(proposal.statusCode).toBe(200);
    const pending = proposal.json() as AssistantConversationResponseDto;
    expect(pending.pendingActions).toMatchObject([{ name: 'create_note', arguments: { title: '购物清单' } }]);
    expect((await notes(owner, householdId)).total).toBe(0);
    const result = await decide(member, householdId, pending);
    expect(result.statusCode).toBe(200);
    expect(result.json().pendingActions).toEqual([]);
    const replay = await decide(member, householdId, pending);
    expect(replay.statusCode).toBe(409);
    expect((await notes(owner, householdId)).notes).toEqual([expect.objectContaining({ title: '购物清单', body: '牛奶\n鸡蛋', createdBy: member.userId })]);
  });

  test('a batch of proposals writes exactly the approved items, in order, and reports each one', async () => {
    const provider = await createProvider(owner, householdId);
    const conversation = await createConversation(owner, householdId, provider.id);
    const batch = ['周一买菜', '周二倒垃圾', '周三交水费'].map(title => tool('create_note', { title }).toolCalls[0]!);
    complete.mockResolvedValueOnce({ content: '', toolCalls: batch });
    const proposal = (await send(owner, householdId, conversation, '记下这三件事')).json() as AssistantConversationResponseDto;
    expect(proposal.pendingActions.map(action => action.arguments.title)).toEqual(['周一买菜', '周二倒垃圾', '周三交水费']);
    expect((await notes(owner, householdId)).total).toBe(0);
    const decision = (approvedIds: string[]) => assistant(owner, householdId, 'POST', `/conversations/${proposal.id}/decision`, { approvedIds, expectedVersion: proposal.version });
    expect((await decision([batch[0]!.id, 'call_not_proposed'])).statusCode).toBe(400);
    expect((await notes(owner, householdId)).total).toBe(0);
    complete.mockResolvedValueOnce({ content: '已记下周一和周三的事项。', toolCalls: [] });
    const result = await decision([batch[2]!.id, batch[0]!.id]);
    expect(result.statusCode).toBe(200);
    expect((await notes(owner, householdId)).notes.map(note => note.title).sort()).toEqual(['周一买菜', '周三交水费']);
    const results = complete.mock.calls[1]![2].filter(message => message.role === 'tool').map(message => JSON.parse(message.content) as { ok: boolean; code?: string });
    expect(results).toEqual([expect.objectContaining({ ok: false, code: 'USER_DECLINED' }), expect.objectContaining({ ok: true }), expect.objectContaining({ ok: true })]);
    expect((await decision([batch[0]!.id])).statusCode).toBe(409);
    expect((await notes(owner, householdId)).total).toBe(2);
  });

  test('rejecting a proposed action leaves business data unchanged', async () => {
    const provider = await createProvider(owner, householdId);
    const conversation = await createConversation(owner, householdId, provider.id);
    complete.mockResolvedValueOnce(tool('create_note', { title: '不应该保存' }));
    const proposal = await send(owner, householdId, conversation);
    expect(proposal.statusCode).toBe(200);
    const response = await decide(owner, householdId, proposal.json() as AssistantConversationResponseDto, false);
    expect(response.statusCode).toBe(200);
    expect(response.json().pendingActions).toEqual([]);
    expect((await notes(owner, householdId)).total).toBe(0);
  });

  test('updates and deletes a note through confirmed tools with persisted outcomes', async () => {
    const created = await request(owner, 'POST', `/households/${householdId}/notes`, { title: '原始笔记', body: '保留正文' });
    expect(created.statusCode).toBe(201);
    const provider = await createProvider(owner, householdId);
    let conversation = await createConversation(owner, householdId, provider.id);
    complete.mockResolvedValueOnce(tool('update_note', { id: created.json().id, expectedUpdatedAt: created.json().updatedAt, title: '已修改笔记' }));
    const proposedUpdate = await send(owner, householdId, conversation, '把原始笔记改名为已修改笔记');
    expect(proposedUpdate.statusCode).toBe(200);
    expect((await notes(owner, householdId)).notes[0]?.title).toBe('原始笔记');
    const updated = await decide(owner, householdId, proposedUpdate.json() as AssistantConversationResponseDto);
    expect(updated.statusCode).toBe(200);
    const note = (await notes(owner, householdId)).notes[0];
    expect(note).toMatchObject({ title: '已修改笔记', body: '保留正文' });
    conversation = updated.json() as AssistantConversationResponseDto;
    complete.mockResolvedValueOnce(tool('delete_note', { id: note?.id, expectedUpdatedAt: note?.updatedAt }));
    const proposedDelete = await send(owner, householdId, conversation, '删除已修改笔记');
    expect(proposedDelete.statusCode).toBe(200);
    expect((await notes(owner, householdId)).total).toBe(1);
    expect((await decide(owner, householdId, proposedDelete.json() as AssistantConversationResponseDto)).statusCode).toBe(200);
    expect((await request(owner, 'GET', `/households/${householdId}/notes/${created.json().id}`)).statusCode).toBe(404);
  });

  test.each([
    { kind: 'event', collection: 'events', createArgs: { title: '家庭采购', startTime: '2026-10-10T14:00:00+08:00', endTime: '2026-10-10T16:00:00+08:00' }, updateArgs: { location: '附近超市' } },
    { kind: 'task', collection: 'tasks', createArgs: { title: '买牛奶', priority: 'high' }, updateArgs: { status: 'completed' } },
  ])('creates, queries, updates and deletes a $kind through confirmed tools', async ({ kind, collection, createArgs, updateArgs }) => {
    const provider = await createProvider(owner, householdId);
    let conversation = await createConversation(owner, householdId, provider.id);
    complete.mockResolvedValueOnce(tool(`create_${kind}`, createArgs));
    const createProposal = await send(owner, householdId, conversation);
    expect(createProposal.statusCode).toBe(200);
    expect((await request(owner, 'GET', `/households/${householdId}/${collection}`)).json()[collection]).toHaveLength(0);
    const created = await decide(owner, householdId, createProposal.json() as AssistantConversationResponseDto);
    expect(created.statusCode).toBe(200);
    let rows = (await request(owner, 'GET', `/households/${householdId}/${collection}`)).json()[collection];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: createArgs.title, createdBy: owner.userId });
    const id = rows[0].id as string;
    conversation = created.json() as AssistantConversationResponseDto;
    complete.mockResolvedValueOnce(tool(`list_${collection}`, { query: createArgs.title }));
    const listed = await send(owner, householdId, conversation, '查询刚才创建的内容');
    expect(listed.statusCode).toBe(200);
    expect(JSON.stringify(complete.mock.calls.at(-1)?.[2])).toContain(id);
    conversation = listed.json() as AssistantConversationResponseDto;
    complete.mockResolvedValueOnce(tool(`update_${kind}`, { id, expectedUpdatedAt: rows[0].updatedAt, ...updateArgs }));
    const updateProposal = await send(owner, householdId, conversation);
    expect(updateProposal.statusCode).toBe(200);
    const updated = await decide(owner, householdId, updateProposal.json() as AssistantConversationResponseDto);
    expect(updated.statusCode).toBe(200);
    rows = (await request(owner, 'GET', `/households/${householdId}/${collection}`)).json()[collection];
    expect(rows[0]).toMatchObject(updateArgs);
    conversation = updated.json() as AssistantConversationResponseDto;
    complete.mockResolvedValueOnce(tool(`delete_${kind}`, { id, expectedUpdatedAt: rows[0].updatedAt }));
    const deleteProposal = await send(owner, householdId, conversation);
    expect(deleteProposal.statusCode).toBe(200);
    expect((await decide(owner, householdId, deleteProposal.json() as AssistantConversationResponseDto)).statusCode).toBe(200);
    expect((await request(owner, 'GET', `/households/${householdId}/${collection}/${id}`)).statusCode).toBe(404);
  });

  test('approval cannot overwrite an edit made after the assistant proposed its change', async () => {
    const created = await request(owner, 'POST', `/households/${householdId}/notes`, { title: '共同笔记', body: '原内容' });
    const provider = await createProvider(owner, householdId);
    const conversation = await createConversation(owner, householdId, provider.id);
    complete.mockResolvedValueOnce(tool('update_note', { id: created.json().id, expectedUpdatedAt: created.json().updatedAt, body: '助手的旧草稿' }));
    const proposed = await send(owner, householdId, conversation);
    expect(proposed.statusCode).toBe(200);
    const humanEdit = await request(owner, 'PUT', `/households/${householdId}/notes/${created.json().id}`, { expectedUpdatedAt: created.json().updatedAt, body: '用户刚刚更新的内容' });
    expect(humanEdit.statusCode).toBe(200);
    const result = await decide(owner, householdId, proposed.json() as AssistantConversationResponseDto);
    expect(JSON.stringify(result.json())).toContain('EDIT_CONFLICT');
    expect((await notes(owner, householdId)).notes[0]?.body).toBe('用户刚刚更新的内容');
  });

  test('approval cannot delete a note that changed after its deletion was proposed', async () => {
    const created = await request(owner, 'POST', `/households/${householdId}/notes`, { title: '待删除的笔记', body: '原内容' });
    const provider = await createProvider(owner, householdId);
    const conversation = await createConversation(owner, householdId, provider.id);
    complete.mockResolvedValueOnce(tool('delete_note', { id: created.json().id, expectedUpdatedAt: created.json().updatedAt }));
    const proposed = await send(owner, householdId, conversation);
    expect(proposed.statusCode).toBe(200);
    expect(proposed.json().pendingActions[0]?.name).toBe('delete_note');
    expect((await request(owner, 'PUT', `/households/${householdId}/notes/${created.json().id}`, { expectedUpdatedAt: created.json().updatedAt, body: '新写入的重要信息' })).statusCode).toBe(200);
    const result = await decide(owner, householdId, proposed.json() as AssistantConversationResponseDto);
    expect(JSON.stringify(result.json())).toContain('EDIT_CONFLICT');
    expect((await notes(owner, householdId)).notes).toEqual([expect.objectContaining({ id: created.json().id, body: '新写入的重要信息' })]);
  });

  test('a stale label proposal preserves the newer label instead of deleting it', async () => {
    const created = await request(owner, 'POST', `/households/${householdId}/labels`, { name: '采购', color: '#336699' });
    expect(created.statusCode).toBe(201);
    const provider = await createProvider(owner, householdId);
    const conversation = await createConversation(owner, householdId, provider.id);
    complete.mockResolvedValueOnce(tool('delete_label', { id: created.json().id, expectedName: '采购', expectedColor: '#336699' }));
    const proposed = await send(owner, householdId, conversation);
    expect(proposed.statusCode).toBe(200);
    expect(proposed.json().pendingActions[0]?.name).toBe('delete_label');
    expect((await request(owner, 'PUT', `/households/${householdId}/labels/${created.json().id}`, { name: '采购与家务' })).statusCode).toBe(200);
    const result = await decide(owner, householdId, proposed.json() as AssistantConversationResponseDto);
    expect(JSON.stringify(result.json())).toContain('EDIT_CONFLICT');
    const labels = await request(owner, 'GET', `/households/${householdId}/labels`);
    expect(labels.json().labels).toEqual([expect.objectContaining({ id: created.json().id, name: '采购与家务', color: '#336699' })]);
  });

  test('shared model credentials do not let a member delete an owners note', async () => {
    const created = await request(owner, 'POST', `/households/${householdId}/notes`, { title: '主人笔记', body: '必须保留' });
    const provider = await createProvider(owner, householdId, 'household');
    const conversation = await createConversation(member, householdId, provider.id);
    complete.mockResolvedValueOnce(tool('delete_note', { id: created.json().id, expectedUpdatedAt: created.json().updatedAt }));
    const proposed = await send(member, householdId, conversation, '删除主人笔记');
    expect(proposed.statusCode).toBe(200);
    const pending = proposed.json() as AssistantConversationResponseDto;
    const result = pending.pendingActions.length ? await decide(member, householdId, pending) : proposed;
    expect(JSON.stringify(result.json())).toContain('FORBIDDEN');
    expect((await notes(owner, householdId)).notes).toEqual([expect.objectContaining({ id: created.json().id, body: '必须保留' })]);
  });

  test('model arguments cannot replace the authenticated actor or selected household', async () => {
    const otherHousehold = await createHousehold(outsider, '另一个家庭');
    const provider = await createProvider(owner, householdId);
    const conversation = await createConversation(owner, householdId, provider.id);
    complete.mockResolvedValueOnce(tool('create_note', { title: '越界笔记', actorId: outsider.userId, householdId: otherHousehold }));
    const response = await send(owner, householdId, conversation);
    expect(response.statusCode).toBe(200);
    expect(response.json().pendingActions).toEqual([]);
    expect((await notes(owner, householdId)).total).toBe(0);
    expect((await notes(outsider, otherHousehold)).total).toBe(0);
  });

  test('a removed membership cannot approve its previously proposed action', async () => {
    const provider = await createProvider(owner, householdId, 'household');
    const conversation = await createConversation(member, householdId, provider.id);
    complete.mockResolvedValueOnce(tool('create_note', { title: '成员离开后的写入' }));
    const proposal = await send(member, householdId, conversation);
    expect(proposal.statusCode).toBe(200);
    await withDatabase(async (client) => { await client.query('DELETE FROM memberships WHERE household_id = $1 AND user_id = $2', [householdId, member.userId]); });
    expect((await decide(member, householdId, proposal.json() as AssistantConversationResponseDto)).statusCode).toBe(404);
    expect((await notes(owner, householdId)).total).toBe(0);
  });

  test('provider failures never return secret-bearing error text and release the conversation for recovery', async () => {
    const provider = await createProvider(owner, householdId);
    const conversation = await createConversation(owner, householdId, provider.id);
    complete.mockRejectedValueOnce(new Error(`Upstream authorization failed: Bearer ${providerSecret}`));
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const failed = await send(owner, householdId, conversation);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('run failed'), expect.stringMatching(/^Error\n/));
    expect(JSON.stringify(logged.mock.calls)).not.toContain(providerSecret);
    logged.mockRestore();
    expect(JSON.stringify(failed.json())).not.toContain(providerSecret);
    const read = await assistant(owner, householdId, 'GET', `/conversations/${conversation.id}`);
    expect(read.statusCode).toBe(200);
    expect(read.json().state).toBe('idle');
    expect(JSON.stringify(read.json())).not.toContain(providerSecret);
    expect((await send(owner, householdId, read.json() as AssistantConversationResponseDto, '重新尝试')).statusCode).toBe(200);
  });

  test('stops a model that keeps asking for more queries and preserves an idle resumable conversation', async () => {
    const provider = await createProvider(owner, householdId);
    const conversation = await createConversation(owner, householdId, provider.id);
    complete.mockImplementation(async () => tool('list_notes', {}));
    const response = await send(owner, householdId, conversation, '一直查询下去');
    expect(response.statusCode).toBe(200);
    expect(complete.mock.calls.length).toBeGreaterThan(1);
    expect(complete.mock.calls.length).toBeLessThanOrEqual(10);
    expect(response.json().state).toBe('idle');
    expect(response.json().pendingActions).toEqual([]);
    expect(JSON.stringify(response.json().messages)).toContain('上限');
    expect((await notes(owner, householdId)).total).toBe(0);
  });

  test('serializes concurrent messages to the same conversation rather than running both model calls', async () => {
    const provider = await createProvider(owner, householdId);
    const conversation = await createConversation(owner, householdId, provider.id);
    let entered!: () => void;
    let release!: (result: AssistantCompletion) => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const pending = new Promise<AssistantCompletion>((resolve) => { release = resolve; });
    complete.mockImplementationOnce(async () => { entered(); return pending; });
    const first = send(owner, householdId, conversation, '第一条消息');
    await started;
    try {
      const concurrent = await send(owner, householdId, conversation, '同时发出的第二条消息');
      expect(concurrent.statusCode).toBe(409);
      expect(complete).toHaveBeenCalledTimes(1);
    } finally {
      release({ content: '第一条处理完成。', toolCalls: [] });
      expect((await first).statusCode).toBe(200);
    }
    const snapshot = await assistant(owner, householdId, 'GET', `/conversations/${conversation.id}`);
    expect(snapshot.json().state).toBe('idle');
    expect(JSON.stringify(snapshot.json().messages)).not.toContain('同时发出的第二条消息');
  });
});
