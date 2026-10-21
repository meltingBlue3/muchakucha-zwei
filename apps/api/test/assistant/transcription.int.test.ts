import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { createApplication } from '../../src/main.js';
import { AssistantProvider } from '../../src/modules/assistant/assistant-provider.js';
import { AssistantTranscriber } from '../../src/modules/assistant/assistant-transcription.js';
import { AssistantProviderFailure } from '../../src/modules/assistant/assistant-transport.js';
import { MAX_ASSISTANT_AUDIO_BASE64_LENGTH, type AssistantProviderResponseDto } from '../../src/modules/assistant/dto/assistant.dto.js';
import { getTestDatabaseUrl, resetDatabase } from '../reset-database.js';

const accessSecret = 'transcription-test-access-secret-longer-than-thirty-two-bytes';
const asrSecret = 'sk-asr-fixture-secret-never-return-this';
const jwt = new JwtService({ secret: accessSecret, signOptions: { algorithm: 'HS256', expiresIn: 15 * 60 } });
const transcribe = vi.fn<AssistantTranscriber['transcribe']>();
const complete = vi.fn<AssistantProvider['complete']>();
// Any base64 is accepted by validation; the service decides whether it is audio it can read.
const recording = Buffer.from('fake m4a recording').toString('base64');
let app: NestFastifyApplication;
let passwordHash: string;

interface ActorFixture { accessToken: string; userId: string }

async function withDatabase<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: getTestDatabaseUrl() });
  await client.connect();
  try { return await run(client); } finally { await client.end(); }
}

async function insertActor(username: string): Promise<ActorFixture> {
  const userId = randomUUID();
  const sessionId = randomUUID();
  await withDatabase(async (client) => {
    await client.query('INSERT INTO "User" ("id", "username", "username_canonical", "display_name", "password_hash") VALUES ($1, $2, $2, $2, $3)', [userId, username, passwordHash]);
    await client.query('INSERT INTO "AuthSession" ("id", "user_id", "absolute_ends_at") VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL \'30 days\')', [sessionId, userId]);
  });
  return { userId, accessToken: await jwt.signAsync({ sub: userId, sid: sessionId }) };
}

function request(actor: ActorFixture, method: 'GET' | 'POST' | 'PUT', path: string, payload?: unknown) {
  return app.getHttpAdapter().getInstance().inject({
    method, url: `/api/v1${path}`,
    headers: { authorization: `Bearer ${actor.accessToken}`, ...(payload === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
  });
}

async function createProvider(actor: ActorFixture, householdId: string, protocol: 'qwen-asr' | 'openai-compatible', visibility: 'private' | 'household'): Promise<AssistantProviderResponseDto> {
  const response = await request(actor, 'POST', `/households/${householdId}/assistant/providers`, {
    name: protocol === 'qwen-asr' ? '语音转写' : '家庭模型', protocol, baseUrl: 'https://dashscope.example.com/compatible-mode/v1',
    model: protocol === 'qwen-asr' ? 'qwen3-asr-flash' : 'test-tool-model', visibility, apiKey: asrSecret,
  });
  expect(response.statusCode).toBe(201);
  return response.json() as AssistantProviderResponseDto;
}

beforeAll(async () => {
  passwordHash = await argon2.hash('transcription-fixture-password', { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  app = await createApplication({
    ...process.env,
    NODE_ENV: 'test', E2E_DISABLE_RATE_LIMITS: 'true', JWT_ACCESS_SECRET: accessSecret, DATABASE_URL: getTestDatabaseUrl(),
    ASSISTANT_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
  });
  vi.spyOn(app.get(AssistantTranscriber), 'transcribe').mockImplementation((...args) => transcribe(...args));
  vi.spyOn(app.get(AssistantProvider), 'complete').mockImplementation((...args) => complete(...args));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => { await app?.close(); });

describe('voice transcription configurations', () => {
  let owner: ActorFixture;
  let member: ActorFixture;
  let outsider: ActorFixture;
  let householdId: string;

  beforeEach(async () => {
    transcribe.mockReset();
    complete.mockReset();
    transcribe.mockResolvedValue({ text: '明天下午3点接孩子。', usage: { inputTokens: 75, outputTokens: 9 } });
    await resetDatabase();
    [owner, member, outsider] = await Promise.all([insertActor('asr-owner'), insertActor('asr-member'), insertActor('asr-outsider')]);
    const household = await request(owner, 'POST', '/households', { name: '语音家庭' });
    householdId = household.json().id as string;
    await withDatabase(client => client.query('INSERT INTO "memberships" ("user_id", "household_id", "role") VALUES ($1, $2, \'MEMBER\')', [member.userId, householdId]));
  });

  test('a member transcribes through a shared configuration; the owner sees the count and nothing is stored', async () => {
    const provider = await createProvider(owner, householdId, 'qwen-asr', 'household');
    expect(provider).toMatchObject({ protocol: 'qwen-asr', hasCredential: true });
    const response = await request(member, 'POST', `/households/${householdId}/assistant/transcriptions`, { providerId: provider.id, mimeType: 'audio/mp4', audio: recording });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ text: '明天下午3点接孩子。' });
    expect(transcribe).toHaveBeenCalledWith(
      { protocol: 'qwen-asr', baseUrl: 'https://dashscope.example.com/compatible-mode/v1', model: 'qwen3-asr-flash', apiKey: asrSecret },
      { data: recording, mimeType: 'audio/mp4' },
    );
    const list = (await request(owner, 'GET', `/households/${householdId}/assistant/providers`)).json() as { providers: AssistantProviderResponseDto[] };
    expect(list.providers[0]?.usage).toMatchObject({ requests: 1, inputTokens: 75, members: [expect.objectContaining({ userId: member.userId, requests: 1 })] });
    // Transcription leaves no conversation behind; the text reaches the model only if the user sends it.
    const stored = await withDatabase(async client => (await client.query<{ count: string }>('SELECT count(*) FROM assistant_conversations')).rows[0]?.count);
    expect(stored).toBe('0');
  });

  test('a recording at the size limit fits within the request body limit', async () => {
    const provider = await createProvider(owner, householdId, 'qwen-asr', 'private');
    const audio = 'A'.repeat(MAX_ASSISTANT_AUDIO_BASE64_LENGTH);
    const response = await request(owner, 'POST', `/households/${householdId}/assistant/transcriptions`, { providerId: provider.id, mimeType: 'audio/webm', audio });
    expect(response.statusCode).toBe(200);
    const tooLong = await request(owner, 'POST', `/households/${householdId}/assistant/transcriptions`, { providerId: provider.id, mimeType: 'audio/webm', audio: `${audio}AAAA` });
    expect(tooLong.statusCode).toBe(400);
    expect(tooLong.json().error.code).toBe('VALIDATION_FAILED');
  });

  test('rejects malformed requests before contacting the service', async () => {
    const provider = await createProvider(owner, householdId, 'qwen-asr', 'private');
    for (const body of [
      { providerId: provider.id, mimeType: 'video/mp4', audio: recording },
      { providerId: provider.id, mimeType: 'audio/mp4', audio: 'not base64!' },
      { providerId: provider.id, mimeType: 'audio/mp4' },
      { providerId: provider.id, mimeType: 'audio/mp4', audio: recording, language: 'en' },
    ]) {
      const response = await request(owner, 'POST', `/households/${householdId}/assistant/transcriptions`, body);
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_FAILED');
    }
    expect(transcribe).not.toHaveBeenCalled();
  });

  test('chat and transcription configurations keep to their own use', async () => {
    const chat = await createProvider(owner, householdId, 'openai-compatible', 'household');
    const asr = await createProvider(owner, householdId, 'qwen-asr', 'household');
    const audioToChat = await request(member, 'POST', `/households/${householdId}/assistant/transcriptions`, { providerId: chat.id, mimeType: 'audio/mp4', audio: recording });
    expect(audioToChat.statusCode).toBe(400);
    expect(audioToChat.json().error.code).toBe('ASSISTANT_PROVIDER_PURPOSE_MISMATCH');
    const conversationOnAsr = await request(member, 'POST', `/households/${householdId}/assistant/conversations`, { providerId: asr.id });
    expect(conversationOnAsr.statusCode).toBe(400);
    expect(conversationOnAsr.json().error.code).toBe('ASSISTANT_PROVIDER_PURPOSE_MISMATCH');
    const switched = await request(owner, 'PUT', `/households/${householdId}/assistant/providers/${asr.id}`, { protocol: 'openai-compatible', expectedUpdatedAt: asr.updatedAt });
    expect(switched.statusCode).toBe(400);
    const unchanged = await withDatabase(async client => (await client.query<{ protocol: string }>('SELECT protocol FROM assistant_providers WHERE id = $1', [asr.id])).rows[0]?.protocol);
    expect(unchanged).toBe('qwen-asr');
    expect(transcribe).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  test('a private configuration is not usable by other members, and outsiders see no household', async () => {
    const provider = await createProvider(owner, householdId, 'qwen-asr', 'private');
    const borrowed = await request(member, 'POST', `/households/${householdId}/assistant/transcriptions`, { providerId: provider.id, mimeType: 'audio/mp4', audio: recording });
    expect(borrowed.statusCode).toBe(404);
    expect(borrowed.json().error.code).toBe('ASSISTANT_PROVIDER_NOT_FOUND');
    const outside = await request(outsider, 'POST', `/households/${householdId}/assistant/transcriptions`, { providerId: provider.id, mimeType: 'audio/mp4', audio: recording });
    expect(outside.statusCode).toBe(404);
    expect(outside.json().error.code).toBe('HOUSEHOLD_NOT_FOUND');
    expect(transcribe).not.toHaveBeenCalled();
  });

  test('the connection check sends silence, not speech, and reports transcription rather than tool calling', async () => {
    const response = await request(member, 'POST', `/households/${householdId}/assistant/providers/check`, {
      protocol: 'qwen-asr', baseUrl: 'https://dashscope.example.com/compatible-mode/v1', model: 'qwen3-asr-flash', apiKey: 'sk-typed',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ toolCalling: false, transcription: true });
    expect(transcribe).toHaveBeenCalledWith(expect.objectContaining({ protocol: 'qwen-asr', apiKey: 'sk-typed' }), { data: expect.any(String), mimeType: 'audio/wav' });
    expect(complete).not.toHaveBeenCalled();
  });

  test('a service failure returns its stable code without upstream text, and counts nothing', async () => {
    const provider = await createProvider(owner, householdId, 'qwen-asr', 'household');
    transcribe.mockRejectedValueOnce(new AssistantProviderFailure('ASSISTANT_PROVIDER_AUTH_FAILED', 'The model provider rejected the credential.', 'status 401'));
    const response = await request(member, 'POST', `/households/${householdId}/assistant/transcriptions`, { providerId: provider.id, mimeType: 'audio/mp4', audio: recording });
    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe('ASSISTANT_PROVIDER_AUTH_FAILED');
    expect(response.body).not.toContain(asrSecret);
    const list = (await request(owner, 'GET', `/households/${householdId}/assistant/providers`)).json() as { providers: AssistantProviderResponseDto[] };
    expect(list.providers[0]?.usage?.requests).toBe(0);
  });
});
