import { randomUUID } from 'node:crypto';
import { BadRequestException, HttpException, Inject, Injectable, Optional } from '@nestjs/common';
import {
  AssistantProviderFailure, assistantProviderFailure, postAssistantJson, validateAssistantBaseUrl, type AssistantTransport,
} from './assistant-transport.js';
import type { AssistantCompletion, AssistantMessage, AssistantProviderConfig, AssistantToolCall, AssistantToolDefinition } from './assistant.types.js';

export { validateAssistantBaseUrl } from './assistant-transport.js';
export const ASSISTANT_TRANSPORT = Symbol('ASSISTANT_TRANSPORT');
const MAX_TOOL_CALLS = 8;
const MAX_CONTENT_LENGTH = 64_000;
const MAX_ARGUMENTS_LENGTH = 32_000;
// Reasoning models spend part of this budget before answering.
const MAX_OUTPUT_TOKENS = 8_192;

function invalidResponse(diagnostic: string): AssistantProviderFailure {
  return new AssistantProviderFailure('ASSISTANT_PROVIDER_RESPONSE_INVALID', 'The model provider returned an invalid or incomplete response.', diagnostic);
}

function truncatedResponse(): AssistantProviderFailure {
  return new AssistantProviderFailure('ASSISTANT_PROVIDER_OUTPUT_TRUNCATED', 'The model reached its output limit before finishing.', 'output limit');
}

function refusedResponse(reason: string): AssistantProviderFailure {
  return new AssistantProviderFailure('ASSISTANT_PROVIDER_REFUSED', 'The model declined to answer.', reason);
}

/** Provider stop reasons are untrusted text; only a short identifier reaches the logs. */
function reasonOf(value: unknown): string {
  return typeof value === 'string' && /^[a-z_]{1,40}$/.test(value) ? value : 'unrecognized';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isJsonValue(value: unknown, depth = 0): boolean {
  if (depth > 20) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item: unknown) => isJsonValue(item, depth + 1));
  if (!isRecord(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) return false;
  return Object.entries(value).every(([key, item]) => !['__proto__', 'constructor', 'prototype'].includes(key) && isJsonValue(item, depth + 1));
}

function textValue(value: unknown, maxLength: number, field: string, allowEmpty = true): string {
  if (typeof value !== 'string' || value.length > maxLength || (!allowEmpty && !value.trim())) throw invalidResponse(`${field} invalid`);
  return value;
}

/** Provider call IDs are not trusted to be well formed or unique across turns (some services number
 * calls per response), so every call gets a server-issued ID that is replayed consistently. */
function toolCall(name: unknown, args: unknown, definitions: AssistantToolDefinition[]): AssistantToolCall {
  const safeName = textValue(name, 100, 'tool name', false);
  if (!definitions.some((definition) => definition.name === safeName)) throw invalidResponse('unknown tool');
  if (!isRecord(args) || !isJsonValue(args) || JSON.stringify(args).length > MAX_ARGUMENTS_LENGTH) throw invalidResponse('tool arguments invalid');
  return { id: `call_${randomUUID().replaceAll('-', '')}`, name: safeName, arguments: args };
}

function tokens(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/** Reported token counts, or nothing when a service omits them; a malformed count reads as zero. */
function usageOf(value: Record<string, unknown>, input: string[], output: string): AssistantCompletion['usage'] {
  if (!isRecord(value.usage)) return undefined;
  const usage = value.usage;
  return { inputTokens: input.reduce((sum, key) => sum + tokens(usage[key]), 0), outputTokens: tokens(usage[output]) };
}

/** A cut-off tool call may carry incomplete arguments, so only a cut-off answer survives. */
function completion(content: string, toolCalls: AssistantToolCall[], truncated: boolean, usage: AssistantCompletion['usage']): AssistantCompletion {
  if (truncated && (toolCalls.length > 0 || !content.trim())) throw truncatedResponse();
  if (!content.trim() && toolCalls.length === 0) throw invalidResponse('empty response');
  if (toolCalls.length > MAX_TOOL_CALLS) throw invalidResponse('too many tool calls');
  return { content: textValue(content, MAX_CONTENT_LENGTH, 'content'), toolCalls, ...(truncated ? { truncated } : {}), ...(usage ? { usage } : {}) };
}

function parseOpenAiResponse(value: unknown, definitions: AssistantToolDefinition[]): AssistantCompletion {
  if (!isRecord(value) || !Array.isArray(value.choices) || value.choices.length !== 1) throw invalidResponse('choices invalid');
  const choice: unknown = value.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message) || choice.message.role !== 'assistant') throw invalidResponse('message invalid');
  const message = choice.message;
  const finish = choice.finish_reason;
  if (finish === 'content_filter') throw refusedResponse('content_filter');
  // Compatible services disagree on the finish reason that accompanies tool calls, so the calls decide.
  if (finish !== undefined && finish !== null && !['stop', 'tool_calls', 'function_call', 'length'].includes(finish as string)) {
    throw invalidResponse(`finish_reason ${reasonOf(finish)}`);
  }
  const content = message.content === null || message.content === undefined ? '' : textValue(message.content, MAX_CONTENT_LENGTH, 'content');
  if (message.tool_calls !== undefined && message.tool_calls !== null && (!Array.isArray(message.tool_calls) || message.tool_calls.length > MAX_TOOL_CALLS)) {
    throw invalidResponse('tool_calls invalid');
  }
  const calls: unknown[] = Array.isArray(message.tool_calls) ? message.tool_calls as unknown[] : [];
  return completion(content, calls.map((call) => {
    if (!isRecord(call) || (call.type !== undefined && call.type !== 'function') || !isRecord(call.function)) throw invalidResponse('tool call invalid');
    const encoded = textValue(call.function.arguments, MAX_ARGUMENTS_LENGTH, 'tool arguments', false);
    let args: unknown;
    try { args = JSON.parse(encoded) as unknown; } catch { throw finish === 'length' ? truncatedResponse() : invalidResponse('tool arguments not json'); }
    return toolCall(call.function.name, args, definitions);
  }), finish === 'length', usageOf(value, ['prompt_tokens'], 'completion_tokens'));
}

function parseAnthropicResponse(value: unknown, definitions: AssistantToolDefinition[]): AssistantCompletion {
  if (!isRecord(value) || value.type !== 'message' || value.role !== 'assistant' || !Array.isArray(value.content) || value.content.length > 64) {
    throw invalidResponse('message invalid');
  }
  const stop = value.stop_reason;
  if (stop === 'refusal') throw refusedResponse('refusal');
  if (!['end_turn', 'tool_use', 'stop_sequence', 'max_tokens'].includes(stop as string)) throw invalidResponse(`stop_reason ${reasonOf(stop)}`);
  const text: string[] = [];
  const calls: AssistantToolCall[] = [];
  for (const block of value.content as unknown[]) {
    if (!isRecord(block)) throw invalidResponse('content block invalid');
    if (block.type === 'text') text.push(textValue(block.text, MAX_CONTENT_LENGTH, 'content'));
    else if (block.type === 'tool_use') calls.push(toolCall(block.name, block.input, definitions));
    else throw invalidResponse(`content block ${reasonOf(block.type)}`);
  }
  // Cached input is reported apart from the rest; all of it is input the request carried.
  return completion(text.join('\n'), calls, stop === 'max_tokens', usageOf(value, ['input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'], 'output_tokens'));
}

function openAiMessages(systemPrompt: string, messages: AssistantMessage[]): Record<string, unknown>[] {
  return [{ role: 'system', content: systemPrompt }, ...messages.map((message) => {
    if (message.role === 'tool') return { role: 'tool', content: message.content, tool_call_id: message.toolCallId };
    return {
      role: message.role,
      content: message.content,
      ...(message.toolCalls?.length ? { tool_calls: message.toolCalls.map((call) => ({
        id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments) },
      })) } : {}),
    };
  })];
}

function anthropicMessages(messages: AssistantMessage[]): { role: 'user' | 'assistant'; content: Record<string, unknown>[] }[] {
  const result: { role: 'user' | 'assistant'; content: Record<string, unknown>[] }[] = [];
  for (const message of messages) {
    if (message.role === 'tool') {
      // The runner serializes every failed observation as {"ok":false,...}.
      const failed = message.content.startsWith('{"ok":false');
      const block = { type: 'tool_result', tool_use_id: message.toolCallId, content: message.content, ...(failed ? { is_error: true } : {}) };
      const previous = result.at(-1);
      // All results for a parallel tool turn belong in one following user message.
      if (previous?.role === 'user') previous.content.push(block);
      else result.push({ role: 'user', content: [block] });
    } else {
      const content: Record<string, unknown>[] = message.content ? [{ type: 'text', text: message.content }] : [];
      if (message.role === 'assistant') for (const call of message.toolCalls ?? []) content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.arguments });
      result.push({ role: message.role, content });
    }
  }
  return result;
}

function withCacheBreakpoint(messages: ReturnType<typeof anthropicMessages>): ReturnType<typeof anthropicMessages> {
  const last = messages.at(-1)?.content.at(-1);
  if (last) last.cache_control = { type: 'ephemeral' };
  return messages;
}

interface ProtocolAdapter {
  path: string;
  headers: (apiKey: string) => Record<string, string>;
  body: (model: string, systemPrompt: string, messages: AssistantMessage[], definitions: AssistantToolDefinition[]) => Record<string, unknown>;
  parse: (value: unknown, definitions: AssistantToolDefinition[]) => AssistantCompletion;
}

// Each provider owns only wire-format translation; permissions and tool execution stay in the runner.
const adapters: Record<AssistantProviderConfig['protocol'], ProtocolAdapter> = {
  'openai-compatible': {
    path: 'chat/completions',
    headers: (apiKey) => ({ authorization: `Bearer ${apiKey}` }),
    body: (model, systemPrompt, messages, definitions) => ({
      model, stream: false, max_completion_tokens: MAX_OUTPUT_TOKENS,
      messages: openAiMessages(systemPrompt, messages),
      ...(definitions.length ? {
        tools: definitions.map((definition) => ({ type: 'function', function: { name: definition.name, description: definition.description, parameters: definition.parameters } })),
        tool_choice: 'auto',
      } : {}),
    }),
    parse: parseOpenAiResponse,
  },
  anthropic: {
    path: 'messages',
    headers: (apiKey) => ({ 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }),
    body: (model, systemPrompt, messages, definitions) => ({
      // Two cache breakpoints: the fixed tools and instructions, and the history up to this request,
      // which the next step of the same run starts with.
      model, stream: false, max_tokens: MAX_OUTPUT_TOKENS, system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: withCacheBreakpoint(anthropicMessages(messages)),
      ...(definitions.length ? {
        tools: definitions.map((definition) => ({ name: definition.name, description: definition.description, input_schema: definition.parameters })),
        tool_choice: { type: 'auto' },
      } : {}),
    }),
    parse: parseAnthropicResponse,
  },
};

@Injectable()
export class AssistantProvider {
  constructor(@Optional() @Inject(ASSISTANT_TRANSPORT) private readonly transport: AssistantTransport = postAssistantJson) {}

  async complete(config: AssistantProviderConfig, systemPrompt: string, messages: AssistantMessage[], definitions: AssistantToolDefinition[]): Promise<AssistantCompletion> {
    const url = validateAssistantBaseUrl(config.baseUrl);
    const adapter = adapters[config.protocol];
    if (!Object.hasOwn(adapters, config.protocol) || !adapter || typeof config.model !== 'string' || !config.model.trim() || config.model.length > 200
      || typeof config.apiKey !== 'string' || !config.apiKey || config.apiKey.length > 8_192 || /[\r\n\u0000]/u.test(config.apiKey)) {
      throw new BadRequestException({ code: 'ASSISTANT_PROVIDER_CONFIG_INVALID', message: 'The model provider configuration is invalid.' });
    }
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/${adapter.path}`;
    try {
      const value = await this.transport(url, adapter.headers(config.apiKey), adapter.body(config.model, systemPrompt, messages, definitions));
      return adapter.parse(value, definitions);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw assistantProviderFailure('adapter');
    }
  }
}
