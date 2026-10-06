import { describe, expect, test } from 'vitest';
import { modelContext } from './assistant-context.js';
import type { AssistantMessage } from './assistant.types.js';

const observation = (data: unknown) => JSON.stringify({ ok: true, tool: 'list_notes', data });

describe('assistant model context', () => {
  test('earlier tool results keep names and IDs but not bodies or edit versions', () => {
    const messages: AssistantMessage[] = [
      { role: 'user', content: '找笔记' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'call_a', name: 'list_notes', arguments: {} }] },
      { role: 'tool', toolCallId: 'call_a', content: observation({ total: 1, items: [{ id: 'n1', title: '清单', body: '正文', updatedAt: '2026-10-04T00:00:00.000Z' }] }) },
      { role: 'tool', toolCallId: 'call_b', content: JSON.stringify({ ok: false, code: 'FORBIDDEN' }) },
      { role: 'assistant', content: '找到了。' },
      { role: 'user', content: '再看看' },
      { role: 'tool', toolCallId: 'call_c', content: observation({ id: 'n1', title: '清单', body: '当前轮的正文' }) },
    ];
    const context = modelContext(messages, 'Asia/Shanghai');
    expect(JSON.parse(context[2]!.content)).toMatchObject({ ok: true, tool: 'list_notes', data: { total: 1, items: [{ id: 'n1', title: '清单' }] } });
    expect(context[2]!.content).not.toContain('正文');
    expect(context[2]!.content).not.toContain('updatedAt');
    expect(context[3]).toEqual(messages[3]);
    expect(context[4]).toBe(messages[4]);
    expect(context[6]).toBe(messages[6]);
    expect(messages[2]!.content).toContain('正文');
  });

  test('each user message leads with its own local send time', () => {
    const context = modelContext([
      { role: 'user', content: '明天提醒我买菜', sentAt: '2026-10-05T15:30:00.000Z' },
      { role: 'assistant', content: '好的。' },
      { role: 'user', content: '旧对话里没有时间的消息' },
    ], 'Asia/Shanghai');
    expect(context[0]).toEqual({ role: 'user', content: '（2026-10-05 周一 23:30（Asia/Shanghai，UTC+08:00））\n明天提醒我买菜' });
    expect(context[2]).toEqual({ role: 'user', content: '旧对话里没有时间的消息' });
  });
});
