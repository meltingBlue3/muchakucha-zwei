import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { describe, expect, test, vi } from 'vitest';
import { AssistantProvider } from './assistant-provider.js';
import type { AssistantTransport } from './assistant-transport.js';
import type { AssistantMessage, AssistantProviderConfig, AssistantToolDefinition } from './assistant.types.js';

const config: AssistantProviderConfig = { protocol: 'openai-compatible', baseUrl: 'https://models.example.com/v1', model: 'test-model', apiKey: 'secret-for-tests' };
const definitions: AssistantToolDefinition[] = [{ name: 'find_notes', description: 'Find notes', parameters: { type: 'object', properties: { query: { type: 'string' } } }, mutates: false }];
const messages: AssistantMessage[] = [{ role: 'user', content: 'Find our travel notes' }];
const openAiCall = { id: 'call_1', type: 'function', function: { name: 'find_notes', arguments: '{"query":"travel"}' } };

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
      model: 'test-model', stream: false, parallel_tool_calls: false,
      messages: [
        { role: 'system', content: 'System instructions' }, messages[0],
        { role: 'assistant', content: '', tool_calls: [openAiCall] },
        { role: 'tool', content: '{"notes":[]}', tool_call_id: 'call_1' },
      ],
      tools: [{ type: 'function', function: { name: 'find_notes', description: 'Find notes', parameters: definitions[0]?.parameters } }],
    }));
  });

  test('OpenAI-compatible tool arguments are parsed as an object', async () => {
    const transport = vi.fn<AssistantTransport>().mockResolvedValue(openAiResponse(null, [openAiCall]));
    await expect(new AssistantProvider(transport).complete(config, 'System', messages, definitions)).resolves.toEqual({
      content: '', toolCalls: [{ id: 'call_1', name: 'find_notes', arguments: { query: 'travel' } }],
    });
  });

  test('Anthropic groups parallel tool results in the next user message', async () => {
    const transport = vi.fn<AssistantTransport>().mockResolvedValue({ type: 'message', role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Two notes found.' }] });
    const history: AssistantMessage[] = [...messages,
      { role: 'assistant', content: 'Looking up notes.', toolCalls: [{ id: 'call_1', name: 'find_notes', arguments: { query: 'travel' } }, { id: 'call_2', name: 'find_notes', arguments: { query: 'packing' } }] },
      { role: 'tool', content: '{"notes":[]}', toolCallId: 'call_1' },
      { role: 'tool', content: '{"notes":[]}', toolCallId: 'call_2' },
    ];
    const result = await new AssistantProvider(transport).complete({ ...config, protocol: 'anthropic' }, 'System', history, definitions);
    expect(result.content).toBe('Two notes found.');
    expect(transport).toHaveBeenCalledWith(new URL('https://models.example.com/v1/messages'), { 'x-api-key': 'secret-for-tests', 'anthropic-version': '2023-06-01' }, expect.objectContaining({
      system: 'System', max_tokens: 4_096,
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'Find our travel notes' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Looking up notes.' }, { type: 'tool_use', id: 'call_1', name: 'find_notes', input: { query: 'travel' } }, { type: 'tool_use', id: 'call_2', name: 'find_notes', input: { query: 'packing' } }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '{"notes":[]}' }, { type: 'tool_result', tool_use_id: 'call_2', content: '{"notes":[]}' }] },
      ],
    }));
  });

  test('Anthropic tool-use blocks become the same provider-independent result', async () => {
    const transport = vi.fn<AssistantTransport>().mockResolvedValue({ type: 'message', role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'text', text: 'Searching.' }, { type: 'tool_use', id: 'toolu_1', name: 'find_notes', input: { query: 'travel' } }] });
    await expect(new AssistantProvider(transport).complete({ ...config, protocol: 'anthropic' }, 'System', messages, definitions)).resolves.toEqual({ content: 'Searching.', toolCalls: [{ id: 'toolu_1', name: 'find_notes', arguments: { query: 'travel' } }] });
  });

  test.each([
    null,
    { choices: [] },
    openAiResponse({ injected: 'text' }),
    openAiResponse('Partial answer', undefined, 'length'),
    openAiResponse('', []),
    openAiResponse(null, [openAiCall, openAiCall]),
    openAiResponse(null, Array.from({ length: 9 }, (_, index) => ({ ...openAiCall, id: `call_${index}` }))),
    openAiResponse(null, [{ ...openAiCall, function: { name: 'delete_everything', arguments: '{}' } }]),
    openAiResponse(null, [{ ...openAiCall, function: { name: 'find_notes', arguments: '[]' } }]),
    openAiResponse(null, [{ ...openAiCall, function: { name: 'find_notes', arguments: 'null' } }]),
    openAiResponse(null, [{ ...openAiCall, function: { name: 'find_notes', arguments: '{' } }]),
    openAiResponse(null, [{ ...openAiCall, function: { name: 'find_notes', arguments: '{"limit":1e999}' } }]),
    openAiResponse(null, [{ ...openAiCall, function: { name: 'find_notes', arguments: '{"__proto__":{"injected":true}}' } }]),
    openAiResponse(null, [{ ...openAiCall, function: { name: 'find_notes', arguments: '{"nested":'.repeat(22) + '{}' + '}'.repeat(22) } }]),
    openAiResponse(null, [{ ...openAiCall, function: { name: 'find_notes', arguments: JSON.stringify({ query: 'x'.repeat(32_000) }) } }]),
    openAiResponse(null, [{ ...openAiCall, function: { name: 'find_notes', arguments: '{}' } }], 'stop'),
    openAiResponse('x'.repeat(64_001)),
  ])('rejects an invalid, truncated or unrecognized OpenAI response (%#)', async (response) => {
    const transport = vi.fn<AssistantTransport>().mockResolvedValue(response);
    const pending = new AssistantProvider(transport).complete(config, 'System', messages, definitions);
    await expect(pending).rejects.toBeInstanceOf(BadGatewayException);
    await expect(pending).rejects.toMatchObject({ response: { code: 'ASSISTANT_PROVIDER_RESPONSE_INVALID' } });
  });

  test.each([
    { type: 'message', role: 'assistant', stop_reason: 'max_tokens', content: [{ type: 'text', text: 'Truncated' }] },
    { type: 'message', role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'tool_use', id: 'call_1', name: 'find_notes', input: {} }] },
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
