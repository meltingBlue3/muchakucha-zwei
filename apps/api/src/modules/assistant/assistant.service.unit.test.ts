import { Logger, NotFoundException } from '@nestjs/common';
import { describe, expect, test, vi } from 'vitest';
import { Prisma, type AssistantConversation } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { AssistantProvider } from './assistant-provider.js';
import type { AssistantSettingsService } from './assistant-settings.service.js';
import type { AssistantToolsService } from './assistant-tools.service.js';
import { AssistantProviderFailure } from './assistant-transport.js';
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
  const settings = { requireMember: vi.fn().mockResolvedValue(undefined), requireProvider, recordUsage: vi.fn().mockResolvedValue(undefined),
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
    prepare: vi.fn<AssistantToolsService['prepare']>().mockImplementation(async (_actor, request) => request), execute,
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
    expect(result.pendingActions).toEqual([]);
    expect(result.messages.at(-1)?.content).toContain('上限');
    assertCompleteToolTurns(state.row.messages as unknown as AssistantMessage[]);
  });

  test('a mixed tool batch runs its reads and proposes its writes; only the approved ones execute', async () => {
    const state = fixture();
    state.complete.mockResolvedValueOnce({ content: '', toolCalls: [call('read_1'), call('write_1', 'create_note'), call('read_2'), call('write_2', 'create_note')] });
    const proposal = await state.service.send(actor, state.row.id, { message: '查询后新增两项', timeZone: 'Asia/Shanghai', expectedVersion: 0 });
    expect(proposal.pendingActions.map(action => action.id)).toEqual(['write_1', 'write_2']);
    expect(state.execute.mock.calls.map(([, tool]) => tool.id)).toEqual(['read_1', 'read_2']);
    await expect(state.service.decide(actor, state.row.id, { approvedIds: ['write_1', 'invented'], expectedVersion: proposal.version })).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });
    const result = await state.service.decide(actor, state.row.id, { approvedIds: ['write_2'], expectedVersion: proposal.version });
    expect(result.pendingActions).toEqual([]);
    expect(state.execute.mock.calls.map(([, tool]) => tool.id)).toEqual(['read_1', 'read_2', 'write_2']);
    const continuedMessages = state.complete.mock.calls[1]?.[2];
    expect(continuedMessages).toBeDefined();
    assertCompleteToolTurns(continuedMessages!);
    expect(continuedMessages!.find(message => message.toolCallId === 'write_1')?.content).toContain('USER_DECLINED');
    await expect(state.service.decide(actor, state.row.id, { approvedIds: ['write_2'], expectedVersion: proposal.version })).rejects.toMatchObject({ response: { code: 'EDIT_CONFLICT' } });
    expect(state.execute).toHaveBeenCalledTimes(3);
  });

  test('declining every proposal executes nothing and answers without calling the model', async () => {
    const state = fixture();
    state.complete.mockResolvedValueOnce({ content: '', toolCalls: [call('write_1', 'create_note'), call('write_2', 'create_note')] });
    const proposal = await state.service.send(actor, state.row.id, { message: '新增两项', timeZone: 'Asia/Shanghai', expectedVersion: 0 });
    const result = await state.service.decide(actor, state.row.id, { approvedIds: [], expectedVersion: proposal.version });
    expect(state.execute).not.toHaveBeenCalled();
    expect(state.complete).toHaveBeenCalledTimes(1);
    expect(result.messages.at(-1)?.content).toBe('已取消这些操作，没有执行任何修改。');
    assertCompleteToolTurns(state.row.messages as unknown as AssistantMessage[]);
  });

  test('earlier turns reach the model shortened while the stored history keeps full results', async () => {
    const state = fixture();
    const body = '很长的笔记正文'.repeat(2_000);
    state.execute.mockResolvedValue({ items: [{ id: 'note-1', title: '旅行清单', body, updatedAt: '2026-10-04T00:00:00.000Z' }], total: 1 });
    state.complete.mockResolvedValueOnce({ content: '', toolCalls: [call('read_1')] }).mockResolvedValueOnce({ content: '找到了旅行清单。', toolCalls: [] });
    const first = await state.service.send(actor, state.row.id, { message: '找旅行清单', timeZone: 'Asia/Shanghai', expectedVersion: 0 });
    // Within the turn that read it, the model sees the full result.
    expect(JSON.stringify(state.complete.mock.calls[1]?.[2])).toContain(body);
    state.complete.mockResolvedValueOnce({ content: '好的。', toolCalls: [] });
    await state.service.send(actor, state.row.id, { message: '谢谢', timeZone: 'Asia/Shanghai', expectedVersion: first.version });
    const later = JSON.stringify(state.complete.mock.calls[2]?.[2]);
    expect(later).not.toContain(body);
    expect(later).not.toContain('2026-10-04T00:00:00.000Z');
    expect(later).toContain('旅行清单');
    expect(JSON.stringify(state.row.messages)).toContain(body);
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

  test('a provider failure tells the user its actual cause and logs no upstream text', async () => {
    const state = fixture();
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    state.complete.mockRejectedValueOnce(new AssistantProviderFailure('ASSISTANT_PROVIDER_AUTH_FAILED', 'rejected', 'status 401'));
    const result = await state.service.send(actor, state.row.id, { message: '查询数据', timeZone: 'Asia/Shanghai', expectedVersion: 0 });
    expect(result.state).toBe('idle');
    expect(result.messages.at(-1)?.content).toContain('模型服务拒绝了 API 密钥');
    expect(warn).toHaveBeenCalledWith(`run stopped: conversation ${state.row.id}, provider provider-1, ASSISTANT_PROVIDER_AUTH_FAILED (status 401)`);
    warn.mockRestore();
  });

  test('a thinking model gets its reasoning back on every later request, across steps and turns', async () => {
    const state = fixture();
    state.complete
      .mockResolvedValueOnce({ content: '', toolCalls: [{ ...call('read_1'), replay: { extra_content: { google: { thought_signature: 'sig' } } } }], replay: { reasoning_content: '先查笔记。' } })
      .mockResolvedValueOnce({ content: '有两条笔记。', toolCalls: [], replay: { reasoning_content: '整理结果。' } });
    const first = await state.service.send(actor, state.row.id, { message: '整理笔记', timeZone: 'Asia/Shanghai', expectedVersion: 0 });
    expect(state.complete.mock.calls[1]?.[2][1]).toEqual({ role: 'assistant', content: '', toolCalls: [{ ...call('read_1'), replay: { extra_content: { google: { thought_signature: 'sig' } } } }], replay: { reasoning_content: '先查笔记。' } });
    // The final answer keeps its reasoning too, and none of it reaches the client.
    expect(first.messages.at(-1)).toEqual({ role: 'assistant', content: '有两条笔记。' });
    state.complete.mockResolvedValueOnce({ content: '好的。', toolCalls: [] });
    await state.service.send(actor, state.row.id, { message: '谢谢', timeZone: 'Asia/Shanghai', expectedVersion: first.version });
    const later = state.complete.mock.calls[2]?.[2] ?? [];
    expect(later.filter(message => message.role === 'assistant').map(message => message.replay?.reasoning_content)).toEqual(['先查笔记。', '整理结果。']);
  });

  test('a rejection after the model called a tool is not blamed on the model name or tool support', async () => {
    const state = fixture();
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const rejected = new AssistantProviderFailure('ASSISTANT_PROVIDER_REJECTED', 'rejected', 'status 400, invalid_request_error');
    state.complete.mockRejectedValueOnce(rejected);
    const before = await state.service.send(actor, state.row.id, { message: '查询数据', timeZone: 'Asia/Shanghai', expectedVersion: 0 });
    expect(before.messages.at(-1)?.content).toMatch(/^模型服务拒绝了这次请求。请确认模型名称正确且支持工具调用。/);

    state.complete.mockResolvedValueOnce({ content: '', toolCalls: [call('read_1')] }).mockRejectedValueOnce(rejected);
    const after = await state.service.send(actor, state.row.id, { message: '整理笔记', timeZone: 'Asia/Shanghai', expectedVersion: before.version });
    expect(after.messages.at(-1)?.content).toMatch(/^模型调用了工具，但模型服务拒绝了带回查询结果的后续请求。/);
    expect(warn).toHaveBeenLastCalledWith(`run stopped: conversation ${state.row.id}, provider provider-1, ASSISTANT_PROVIDER_FOLLOW_UP_REJECTED (status 400, invalid_request_error)`);
    warn.mockRestore();
  });

  test('a cut-off answer is kept with a visible notice', async () => {
    const state = fixture();
    state.complete.mockResolvedValueOnce({ content: '本周安排如下', toolCalls: [], truncated: true });
    const result = await state.service.send(actor, state.row.id, { message: '整理本周安排', timeZone: 'Asia/Shanghai', expectedVersion: 0 });
    expect(result.messages.at(-1)?.content).toMatch(/^本周安排如下\n\n（回答达到模型输出上限/);
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
      state.service.decide(actor, state.row.id, { approvedIds: proposal.pendingActions.map(action => action.id), expectedVersion: proposal.version }),
      state.service.decide(actor, state.row.id, { approvedIds: proposal.pendingActions.map(action => action.id), expectedVersion: proposal.version }),
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
