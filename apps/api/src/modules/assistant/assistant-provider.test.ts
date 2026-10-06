import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { describe, expect, test, vi } from 'vitest';
import { AssistantProvider } from './assistant-provider.js';
import type { AssistantTransport } from './assistant-transport.js';
import type { AssistantMessage, AssistantProviderConfig, AssistantToolDefinition } from './assistant.types.js';

const config: AssistantProviderConfig = { protocol: 'openai-compatible', baseUrl: 'https://models.example.com/v1', model: 'test-model', apiKey: 'secret-for-tests' };
const definitions: AssistantToolDefinition[] = [{ name: 'find_notes', description: 'Find notes', parameters: { type: 'object', properties: { query: { type: 'string' } } }, mutates: false }];
const messages: AssistantMessage[] = [{ role: 'user', content: 'Find our travel notes' }];
const openAiCall = { id: 'call_1', type: 'function', function: { name: 'find_notes', arguments: '{"query":"travel"}' } };
const serverId = expect.stringMatching(/^call_[0-9a-f]{32}$/);

function openAiResponse(content: unknown = 'Here are your notes.', calls?: unknown, reason = calls ? 'tool_calls' : 'stop'): unknown {
  return { choices: [{ finish_reason: reason, message: { role: 'assistant', content, ...(calls === undefined ? {} : { tool_calls: calls }) } }] };
}

describe('assistant provider adapters', () => {
  test('OpenAI-compatible requests preserve a custom API path and tool-call / result correlation', async () => {
    const transport = vi.fn<AssistantTransport>().mockResolvedValue(openAiResponse());
    const history: AssistantMessage[] = [...messages,
      { role: 'assistant', content: '', toolCalls: [{ id: 'call_1', name: 'find_notes', arguments: { query: 'travel' } }] },
      { role: 'tool', content: '{"notes":[]}', toolCallId: 'call_1' },
    ];
    const result = await new AssistantProvider(transport).complete({ ...config, baseUrl: 'https://models.example.com/gateway/v1/' }, 'System instructions', history, definitions);
    expect(result).toEqual({ content: 'Here are your notes.', toolCalls: [] });
    expect(transport).toHaveBeenCalledWith(new URL('https://models.example.com/gateway/v1/chat/completions'), { authorization: 'Bearer secret-for-tests' }, expect.objectContaining({
      model: 'test-model', stream: false, tool_choice: 'auto',
      messages: [
        { role: 'system', content: 'System instructions' }, messages[0],
        { role: 'assistant', content: '', tool_calls: [openAiCall] },
        { role: 'tool', content: '{"notes":[]}', tool_call_id: 'call_1' },
      ],
      tools: [{ type: 'function', function: { name: 'find_notes', description: 'Find notes', parameters: definitions[0]?.parameters } }],
    }));
    // Independent reads may be batched into one step; the runner still holds every write for confirmation.
    expect(transport.mock.calls[0]?.[2]).not.toHaveProperty('parallel_tool_calls');
  });

  test('OpenAI-compatible tool arguments are parsed as an object', async () => {
    const transport = vi.fn<AssistantTransport>().mockResolvedValue(openAiResponse(null, [openAiCall]));
    await expect(new AssistantProvider(transport).complete(config, 'System', messages, definitions)).resolves.toEqual({
      content: '', toolCalls: [{ id: serverId, name: 'find_notes', arguments: { query: 'travel' } }],
    });
  });

  test('compatible services may number call IDs per response and report stop with tool calls', async () => {
    const numbered = { ...openAiCall, id: 'functions.find_notes:0' };
    const transport = vi.fn<AssistantTransport>().mockResolvedValue(openAiResponse(null, [numbered, numbered], 'stop'));
    const result = await new AssistantProvider(transport).complete(config, 'System', messages, definitions);
    expect(result.toolCalls).toEqual([
      { id: serverId, name: 'find_notes', arguments: { query: 'travel' } },
      { id: serverId, name: 'find_notes', arguments: { query: 'travel' } },
    ]);
    expect(result.toolCalls[0]!.id).not.toBe(result.toolCalls[1]!.id);
  });

  test('a cut-off answer is kept and marked, while a cut-off tool call or empty answer fails', async () => {
    const transport = vi.fn<AssistantTransport>().mockResolvedValueOnce(openAiResponse('Partial answer', undefined, 'length'));
    await expect(new AssistantProvider(transport).complete(config, 'System', messages, definitions)).resolves.toEqual({ content: 'Partial answer', toolCalls: [], truncated: true });
    for (const response of [
      openAiResponse(null, [{ ...openAiCall, function: { name: 'find_notes', arguments: '{"query":"tra' } }], 'length'),
      openAiResponse(null, [openAiCall], 'length'),
      openAiResponse('', undefined, 'length'),
    ]) {
      transport.mockResolvedValueOnce(response);
      await expect(new AssistantProvider(transport).complete(config, 'System', messages, definitions)).rejects.toMatchObject({ response: { code: 'ASSISTANT_PROVIDER_OUTPUT_TRUNCATED' } });
    }
  });

  test('reported token counts are kept, including cached Anthropic input', async () => {
    const transport = vi.fn<AssistantTransport>()
      .mockResolvedValueOnce({ ...openAiResponse() as object, usage: { prompt_tokens: 1_200, completion_tokens: 80 } })
      .mockResolvedValueOnce({ type: 'message', role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: '好的' }],
        usage: { input_tokens: 50, cache_read_input_tokens: 2_000, cache_creation_input_tokens: 300, output_tokens: 40 } })
      .mockResolvedValueOnce({ ...openAiResponse() as object, usage: { prompt_tokens: -5, completion_tokens: 'many' } });
    await expect(new AssistantProvider(transport).complete(config, 'System', messages, definitions)).resolves.toMatchObject({ usage: { inputTokens: 1_200, outputTokens: 80 } });
    await expect(new AssistantProvider(transport).complete({ ...config, protocol: 'anthropic' }, 'System', messages, definitions)).resolves.toMatchObject({ usage: { inputTokens: 2_350, outputTokens: 40 } });
    await expect(new AssistantProvider(transport).complete(config, 'System', messages, definitions)).resolves.toMatchObject({ usage: { inputTokens: 0, outputTokens: 0 } });
  });

  test('a filtered or refused answer is reported as a refusal', async () => {
    const transport = vi.fn<AssistantTransport>()
      .mockResolvedValueOnce(openAiResponse('', undefined, 'content_filter'))
      .mockResolvedValueOnce({ type: 'message', role: 'assistant', stop_reason: 'refusal', content: [] });
    await expect(new AssistantProvider(transport).complete(config, 'System', messages, definitions)).rejects.toMatchObject({ response: { code: 'ASSISTANT_PROVIDER_REFUSED' } });
    await expect(new AssistantProvider(transport).complete({ ...config, protocol: 'anthropic' }, 'System', messages, definitions)).rejects.toMatchObject({ response: { code: 'ASSISTANT_PROVIDER_REFUSED' } });
  });

  test('Anthropic groups parallel tool results in the next user message', async () => {
    const transport = vi.fn<AssistantTransport>().mockResolvedValue({ type: 'message', role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Two notes found.' }] });
    const history: AssistantMessage[] = [...messages,
      { role: 'assistant', content: 'Looking up notes.', toolCalls: [{ id: 'call_1', name: 'find_notes', arguments: { query: 'travel' } }, { id: 'call_2', name: 'find_notes', arguments: { query: 'packing' } }] },
      { role: 'tool', content: '{"notes":[]}', toolCallId: 'call_1' },
      { role: 'tool', content: '{"ok":false,"code":"FORBIDDEN"}', toolCallId: 'call_2' },
    ];
    const result = await new AssistantProvider(transport).complete({ ...config, protocol: 'anthropic' }, 'System', history, definitions);
    expect(result.content).toBe('Two notes found.');
    expect(transport).toHaveBeenCalledWith(new URL('https://models.example.com/v1/messages'), { 'x-api-key': 'secret-for-tests', 'anthropic-version': '2023-06-01' }, expect.objectContaining({
      system: [{ type: 'text', text: 'System', cache_control: { type: 'ephemeral' } }], max_tokens: 8_192,
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'Find our travel notes' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Looking up notes.' }, { type: 'tool_use', id: 'call_1', name: 'find_notes', input: { query: 'travel' } }, { type: 'tool_use', id: 'call_2', name: 'find_notes', input: { query: 'packing' } }] },
        // The last block marks how far the next step of the run can reuse the cached history.
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '{"notes":[]}' }, { type: 'tool_result', tool_use_id: 'call_2', content: '{"ok":false,"code":"FORBIDDEN"}', is_error: true, cache_control: { type: 'ephemeral' } }] },
      ],
    }));
  });

  test('Anthropic tool-use blocks become the same provider-independent result', async () => {
    const transport = vi.fn<AssistantTransport>().mockResolvedValue({ type: 'message', role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'text', text: 'Searching.' }, { type: 'tool_use', id: 'toolu_1', name: 'find_notes', input: { query: 'travel' } }] });
    await expect(new AssistantProvider(transport).complete({ ...config, protocol: 'anthropic' }, 'System', messages, definitions)).resolves.toEqual({ content: 'Searching.', toolCalls: [{ id: serverId, name: 'find_notes', arguments: { query: 'travel' } }] });
  });

  test('Anthropic tool use is decided by content blocks and a max_tokens answer is marked as cut off', async () => {
    const transport = vi.fn<AssistantTransport>()
      .mockResolvedValueOnce({ type: 'message', role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'tool_use', id: 'call_1', name: 'find_notes', input: {} }] })
      .mockResolvedValueOnce({ type: 'message', role: 'assistant', stop_reason: 'max_tokens', content: [{ type: 'text', text: 'Truncated' }] });
    const anthropic = { ...config, protocol: 'anthropic' as const };
    await expect(new AssistantProvider(transport).complete(anthropic, 'System', messages, definitions)).resolves.toMatchObject({ toolCalls: [{ name: 'find_notes', arguments: {} }] });
    await expect(new AssistantProvider(transport).complete(anthropic, 'System', messages, definitions)).resolves.toEqual({ content: 'Truncated', toolCalls: [], truncated: true });
  });

  test.each([
    null,
    { choices: [] },
    openAiResponse({ injected: 'text' }),
    openAiResponse('', []),
    openAiResponse('Answer', undefined, 'unexpected_reason'),
    openAiResponse(null, Array.from({ length: 9 }, (_, index) => ({ ...openAiCall, id: `call_${index}` }))),
    openAiResponse(null, [{ ...openAiCall, function: { name: 'delete_everything', arguments: '{}' } }]),
    openAiResponse(null, [{ ...openAiCall, function: { name: 'find_notes', arguments: '[]' } }]),
    openAiResponse(null, [{ ...openAiCall, function: { name: 'find_notes', arguments: 'null' } }]),
    openAiResponse(null, [{ ...openAiCall, function: { name: 'find_notes', arguments: '{' } }]),
    openAiResponse(null, [{ ...openAiCall, function: { name: 'find_notes', arguments: '{"limit":1e999}' } }]),
    openAiResponse(null, [{ ...openAiCall, function: { name: 'find_notes', arguments: '{"__proto__":{"injected":true}}' } }]),
    openAiResponse(null, [{ ...openAiCall, function: { name: 'find_notes', arguments: '{"nested":'.repeat(22) + '{}' + '}'.repeat(22) } }]),
    openAiResponse(null, [{ ...openAiCall, function: { name: 'find_notes', arguments: JSON.stringify({ query: 'x'.repeat(32_000) }) } }]),
    openAiResponse('x'.repeat(64_001)),
  ])('rejects an invalid, truncated or unrecognized OpenAI response (%#)', async (response) => {
    const transport = vi.fn<AssistantTransport>().mockResolvedValue(response);
    const pending = new AssistantProvider(transport).complete(config, 'System', messages, definitions);
    await expect(pending).rejects.toBeInstanceOf(BadGatewayException);
    await expect(pending).rejects.toMatchObject({ response: { code: 'ASSISTANT_PROVIDER_RESPONSE_INVALID' } });
  });

  test.each([
    { type: 'message', role: 'assistant', stop_reason: 'pause_turn', content: [{ type: 'text', text: 'Paused' }] },
    { type: 'message', role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'call_1', name: 'find_notes', input: [] }] },
    { type: 'message', role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'server_tool_use', id: 'server_1', name: 'shell', input: {} }] },
  ])('rejects malformed or unsupported Anthropic responses (%#)', async (response) => {
    const transport = vi.fn<AssistantTransport>().mockResolvedValue(response);
    await expect(new AssistantProvider(transport).complete({ ...config, protocol: 'anthropic' }, 'System', messages, definitions)).rejects.toMatchObject({ response: { code: 'ASSISTANT_PROVIDER_RESPONSE_INVALID' } });
  });

  test('provider failures do not expose credentials or upstream response text', async () => {
    const transport = vi.fn<AssistantTransport>().mockRejectedValue(new Error('secret-for-tests sensitive family notes'));
    const pending = new AssistantProvider(transport).complete(config, 'System', messages, definitions);
    await expect(pending).rejects.toMatchObject({ response: { code: 'ASSISTANT_PROVIDER_FAILED' } });
    try { await pending; } catch (error) { expect(JSON.stringify(error)).not.toContain('secret-for-tests'); expect(JSON.stringify(error)).not.toContain('sensitive family notes'); }
  });

  test('invalid endpoint or header credentials never reach the transport', async () => {
    const transport = vi.fn<AssistantTransport>();
    await expect(new AssistantProvider(transport).complete({ ...config, baseUrl: 'http://127.0.0.1' }, 'System', messages, definitions)).rejects.toBeInstanceOf(BadRequestException);
    await expect(new AssistantProvider(transport).complete({ ...config, apiKey: 'injected\r\nheader' }, 'System', messages, definitions)).rejects.toBeInstanceOf(BadRequestException);
    expect(transport).not.toHaveBeenCalled();
  });
});
