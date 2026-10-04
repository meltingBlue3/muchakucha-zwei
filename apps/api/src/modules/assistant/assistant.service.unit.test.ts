import { NotFoundException } from '@nestjs/common';
import { describe, expect, test, vi } from 'vitest';
import { Prisma, type AssistantConversation } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { AssistantProvider } from './assistant-provider.js';
import type { AssistantSettingsService } from './assistant-settings.service.js';
import type { AssistantToolsService } from './assistant-tools.service.js';
import { AssistantService } from './assistant.service.js';
import type { AssistantActor, AssistantCompletion, AssistantMessage, AssistantToolCall } from './assistant.types.js';

const actor: AssistantActor = { householdId: 'household-1', userId: 'member-1' };

function fixture() {
  const row: AssistantConversation = {
    id: 'conversation-1', householdId: actor.householdId, userId: actor.userId, providerId: 'provider-1', providerVersion: new Date(),
    title: '新对话', messages: [], pendingAction: null, version: 0, state: 'idle', timeZone: 'Asia/Shanghai',
    createdAt: new Date(), updatedAt: new Date(),
  };
  const requireProvider = vi.fn().mockResolvedValue({ id: 'provider-1' });
  const settings = { requireMember: vi.fn().mockResolvedValue(undefined), requireProvider,
    resolve: vi.fn().mockImplementation(async () => {
      await requireProvider();
      return { protocol: 'openai-compatible', baseUrl: 'https://api.example.com/v1', model: 'test', apiKey: 'test-credential' };
    }),
  };
  const complete = vi.fn<AssistantProvider['complete']>().mockResolvedValue({ content: '完成。', toolCalls: [] });
  const execute = vi.fn<AssistantToolsService['execute']>().mockResolvedValue({ items: [] });
  const tools = {
    definitions: () => [
      { name: 'list_notes', description: 'Read notes', parameters: {}, mutates: false },
      { name: 'create_note', description: 'Create note', parameters: {}, mutates: true },
    ],
    prepare: vi.fn<AssistantToolsService['prepare']>().mockResolvedValue(undefined), execute,
  };
  const database = { assistantConversation: {
    findFirst: vi.fn().mockImplementation(async () => structuredClone(row)),
    updateMany: vi.fn().mockImplementation(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      for (const [key, value] of Object.entries(where)) {
        const actual = (row as unknown as Record<string, unknown>)[key];
        if (actual instanceof Date && value instanceof Date ? actual.getTime() !== value.getTime() : actual !== value) return { count: 0 };
      }
      if (data.version) row.version += 1;
      if (typeof data.state === 'string') row.state = data.state;
      if (typeof data.timeZone === 'string') row.timeZone = data.timeZone;
      if (typeof data.title === 'string') row.title = data.title;
      if (data.messages !== undefined) row.messages = structuredClone(data.messages) as Prisma.JsonValue;
      if (data.pendingAction !== undefined) row.pendingAction = data.pendingAction === Prisma.DbNull ? null : structuredClone(data.pendingAction) as Prisma.JsonValue;
      row.updatedAt = new Date();
      return { count: 1 };
    }),
  } };
  const service = new AssistantService(database as unknown as PrismaService, settings as unknown as AssistantSettingsService,
    { complete } as unknown as AssistantProvider, tools as unknown as AssistantToolsService);
  return { service, row, complete, tools, settings, execute };
}

function call(id: string, name = 'list_notes'): AssistantToolCall {
  return { id, name, arguments: name === 'create_note' ? { title: '确认后创建' } : {} };
}

function assertCompleteToolTurns(messages: AssistantMessage[]): void {
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index]!;
    if (!message.toolCalls?.length) continue;
    const results: string[] = [];
    for (let next = index + 1; messages[next]?.role === 'tool'; next++) {
      results.push(messages[next]!.toolCallId!);
    }
    expect(results.sort()).toEqual(message.toolCalls.map(tool => tool.id).sort());
  }
}

describe('assistant runner boundaries', () => {
  test('an uncooperative model cannot exceed the total query budget by batching calls', async () => {
    const state = fixture();
    let turn = 0;
    state.complete.mockImplementation(async () => {
      turn++;
      return { content: '', toolCalls: Array.from({ length: 8 }, (_, index) => call(`turn_${turn}_${index}`)) };
    });
    const result = await state.service.send(actor, state.row.id, { message: '持续查询', timeZone: 'Asia/Shanghai', expectedVersion: 0 });
    expect(state.execute).toHaveBeenCalledTimes(24);
    expect(state.complete).toHaveBeenCalledTimes(3);
    expect(result.state).toBe('idle');
    expect(result.pendingAction).toBeNull();
    expect(result.messages.at(-1)?.content).toContain('上限');
    assertCompleteToolTurns(state.row.messages as unknown as AssistantMessage[]);
  });

  test('a mixed tool batch executes only its confirmed write and remains valid for continuation', async () => {
    const state = fixture();
    state.complete.mockResolvedValueOnce({ content: '', toolCalls: [call('read_1'), call('write_1', 'create_note'), call('read_2'), call('write_2', 'create_note')] });
    const proposal = await state.service.send(actor, state.row.id, { message: '查询后新增两项', timeZone: 'Asia/Shanghai', expectedVersion: 0 });
    expect(proposal.pendingAction?.name).toBe('create_note');
    expect(state.execute.mock.calls.map(([, tool]) => tool.id)).toEqual(['read_1']);
    const result = await state.service.decide(actor, state.row.id, { approve: true, expectedVersion: proposal.version });
    expect(result.pendingAction).toBeNull();
    expect(state.execute.mock.calls.map(([, tool]) => tool.id)).toEqual(['read_1', 'write_1']);
    const continuedMessages = state.complete.mock.calls[1]?.[2];
    expect(continuedMessages).toBeDefined();
    assertCompleteToolTurns(continuedMessages!);
    await expect(state.service.decide(actor, state.row.id, { approve: true, expectedVersion: proposal.version })).rejects.toMatchObject({ response: { code: 'EDIT_CONFLICT' } });
    expect(state.execute).toHaveBeenCalledTimes(2);
  });

  test('revocation during a tool batch stops subsequent queries and repairs unanswered results', async () => {
    const state = fixture();
    state.complete.mockResolvedValueOnce({ content: '', toolCalls: [call('read_1'), call('read_2')] });
    state.execute.mockImplementationOnce(async () => {
      state.settings.requireProvider.mockRejectedValue(new NotFoundException({ code: 'ASSISTANT_PROVIDER_NOT_FOUND' }));
      return { items: [{ title: 'First authorized query' }] };
    });
    const result = await state.service.send(actor, state.row.id, { message: '查询数据', timeZone: 'Asia/Shanghai', expectedVersion: 0 });
    expect(state.execute.mock.calls.map(([, tool]) => tool.id)).toEqual(['read_1']);
    expect(state.complete).toHaveBeenCalledTimes(1);
    expect(result.state).toBe('idle');
    expect(JSON.stringify(result.messages)).toContain('RUN_INTERRUPTED');
    assertCompleteToolTurns(state.row.messages as unknown as AssistantMessage[]);
  });

  test('concurrent approvals cannot both execute the same proposed write', async () => {
    const state = fixture();
    state.complete.mockResolvedValueOnce({ content: '', toolCalls: [call('write_1', 'create_note')] });
    const proposal = await state.service.send(actor, state.row.id, { message: '新增笔记', timeZone: 'Asia/Shanghai', expectedVersion: 0 });
    let release!: (result: AssistantCompletion) => void;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const blocked = new Promise<AssistantCompletion>(resolve => { release = resolve; });
    state.complete.mockImplementationOnce(async () => { entered(); return blocked; });
    const approvals = Promise.allSettled([
      state.service.decide(actor, state.row.id, { approve: true, expectedVersion: proposal.version }),
      state.service.decide(actor, state.row.id, { approve: true, expectedVersion: proposal.version }),
    ]);
    await started;
    try {
      expect(state.execute).toHaveBeenCalledTimes(1);
    } finally { release({ content: '创建完成。', toolCalls: [] }); }
    const results = await approvals;
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { response: { code: 'EDIT_CONFLICT' } } });
    expect(state.row.state).toBe('idle');
    expect(state.execute).toHaveBeenCalledTimes(1);
  });
});
