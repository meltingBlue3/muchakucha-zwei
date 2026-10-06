import { randomUUID } from 'node:crypto';
import { BadRequestException, HttpException, Inject, Injectable, Optional } from '@nestjs/common';
import {
  AssistantProviderFailure, assistantProviderFailure, postAssistantJson, validateAssistantBaseUrl, type AssistantTransport,
} from './assistant-transport.js';
import type {
  AssistantCompletion, AssistantMessage, AssistantProviderConfig, AssistantReplay, AssistantToolCall, AssistantToolDefinition,
} from './assistant.types.js';

export { validateAssistantBaseUrl } from './assistant-transport.js';
export const ASSISTANT_TRANSPORT = Symbol('ASSISTANT_TRANSPORT');
const MAX_TOOL_CALLS = 8;
const MAX_CONTENT_LENGTH = 64_000;
const MAX_ARGUMENTS_LENGTH = 32_000;
// Reasoning models spend part of this budget before answering.
const MAX_OUTPUT_TOKENS = 8_192;
// Reasoning shares the output budget, so anything longer is not a real reply.
const MAX_REPLAY_LENGTH = 128_000;
const MAX_CALL_REPLAY_LENGTH = 16_000;

/** Thinking modes reject a follow-up request that leaves out their earlier reasoning: DeepSeek and
 * Kimi return it as reasoning_content, OpenRouter as reasoning_details, and Gemini signs each tool
 * call in extra_content. These fields are stored as returned and sent back on every later request. */
const OPENAI_MESSAGE_REPLAY = ['reasoning_content', 'reasoning_details'];
const OPENAI_CALL_REPLAY = ['extra_content'];

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

function replayOf(source: Record<string, unknown>, fields: string[], maxLength: number): AssistantReplay | undefined {
  const present = fields.filter((field) => source[field] !== undefined && source[field] !== null);
  if (!present.length) return undefined;
  const replay: AssistantReplay = Object.fromEntries(present.map((field) => [field, source[field]]));
  if (!isJsonValue(replay) || JSON.stringify(replay).length > maxLength) throw invalidResponse('replay invalid');
  return replay;
}

function picked(replay: AssistantReplay | undefined, fields: string[]): AssistantReplay {
  return replay ? Object.fromEntries(fields.filter((field) => Object.hasOwn(replay, field)).map((field) => [field, replay[field]])) : {};
}

/** Call IDs go back as the provider issued them, because some services accept only their own format
 * (Mistral takes nine alphanumerics). An ID that is malformed, or already used in this conversation
 * (some services number calls per response), is replaced with a server-issued one. */
function callIds(messages: AssistantMessage[], pattern: RegExp): (raw: unknown) => string {
  const used = new Set(messages.flatMap((message) => (message.toolCalls ?? []).map((call) => call.id)));
  return (raw) => {
    const id = typeof raw === 'string' && pattern.test(raw) && !used.has(raw) ? raw : `call_${randomUUID().replaceAll('-', '')}`;
    used.add(id);
    return id;
  };
}

function toolCall(id: string, name: unknown, args: unknown, definitions: AssistantToolDefinition[], replay?: AssistantReplay): AssistantToolCall {
  const safeName = textValue(name, 100, 'tool name', false);
  if (!definitions.some((definition) => definition.name === safeName)) throw invalidResponse('unknown tool');
  if (!isRecord(args) || !isJsonValue(args) || JSON.stringify(args).length > MAX_ARGUMENTS_LENGTH) throw invalidResponse('tool arguments invalid');
  return { id, name: safeName, arguments: args, ...(replay ? { replay } : {}) };
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
function completion(content: string, toolCalls: AssistantToolCall[], truncated: boolean, usage: AssistantCompletion['usage'], replay?: AssistantReplay): AssistantCompletion {
  if (truncated && (toolCalls.length > 0 || !content.trim())) throw truncatedResponse();
  if (!content.trim() && toolCalls.length === 0) throw invalidResponse('empty response');
  if (toolCalls.length > MAX_TOOL_CALLS) throw invalidResponse('too many tool calls');
  return {
    content: textValue(content, MAX_CONTENT_LENGTH, 'content'), toolCalls,
    ...(truncated ? { truncated } : {}), ...(usage ? { usage } : {}), ...(replay ? { replay } : {}),
  };
}

function parseOpenAiResponse(value: unknown, definitions: AssistantToolDefinition[], nextId: (raw: unknown) => string): AssistantCompletion {
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
    return toolCall(nextId(call.id), call.function.name, args, definitions, replayOf(call, OPENAI_CALL_REPLAY, MAX_CALL_REPLAY_LENGTH));
  }), finish === 'length', usageOf(value, ['prompt_tokens'], 'completion_tokens'), replayOf(message, OPENAI_MESSAGE_REPLAY, MAX_REPLAY_LENGTH));
}

function parseAnthropicResponse(value: unknown, definitions: AssistantToolDefinition[], nextId: (raw: unknown) => string): AssistantCompletion {
  if (!isRecord(value) || value.type !== 'message' || value.role !== 'assistant' || !Array.isArray(value.content) || value.content.length > 64) {
    throw invalidResponse('message invalid');
  }
  const stop = value.stop_reason;
  if (stop === 'refusal') throw refusedResponse('refusal');
  if (!['end_turn', 'tool_use', 'stop_sequence', 'max_tokens'].includes(stop as string)) throw invalidResponse(`stop_reason ${reasonOf(stop)}`);
  const text: string[] = [];
  const calls: AssistantToolCall[] = [];
  // Thinking blocks go back in their original order among the text and tool use. A tool_use entry
  // stands for the next call, so the call keeps whatever ID it was given.
  const blocks: Record<string, unknown>[] = [];
  let thinking = false;
  for (const block of value.content as unknown[]) {
    if (!isRecord(block)) throw invalidResponse('content block invalid');
    if (block.type === 'text') {
      const part = textValue(block.text, MAX_CONTENT_LENGTH, 'content');
      text.push(part);
      blocks.push({ type: 'text', text: part });
    } else if (block.type === 'tool_use') {
      calls.push(toolCall(nextId(block.id), block.name, block.input, definitions));
      blocks.push({ type: 'tool_use' });
    } else if (block.type === 'thinking' && typeof block.thinking === 'string' && (block.signature === undefined || typeof block.signature === 'string')) {
      thinking = true;
      blocks.push({ type: 'thinking', thinking: block.thinking, ...(block.signature === undefined ? {} : { signature: block.signature }) });
    } else if (block.type === 'redacted_thinking' && typeof block.data === 'string') {
      thinking = true;
      blocks.push({ type: 'redacted_thinking', data: block.data });
    } else throw invalidResponse(`content block ${reasonOf(block.type)}`);
  }
  // Cached input is reported apart from the rest; all of it is input the request carried.
  return completion(text.join('\n'), calls, stop === 'max_tokens', usageOf(value, ['input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'], 'output_tokens'),
    thinking ? replayOf({ content: blocks }, ['content'], MAX_REPLAY_LENGTH) : undefined);
}

function openAiMessages(systemPrompt: string, messages: AssistantMessage[]): Record<string, unknown>[] {
  // A service that returns reasoning_content expects it on every assistant turn it is sent. Runner
  // notices, and replies stored before reasoning was kept, have none, so they carry an empty one.
  const reasoning = messages.some((message) => message.replay !== undefined && Object.hasOwn(message.replay, 'reasoning_content'));
  return [{ role: 'system', content: systemPrompt }, ...messages.map((message) => {
    if (message.role === 'tool') return { role: 'tool', content: message.content, tool_call_id: message.toolCallId };
    if (message.role === 'user') return { role: 'user', content: message.content };
    return {
      role: 'assistant',
      content: message.content,
      ...(reasoning ? { reasoning_content: '' } : {}),
      ...picked(message.replay, OPENAI_MESSAGE_REPLAY),
      ...(message.toolCalls?.length ? { tool_calls: message.toolCalls.map((call) => ({
        id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments) }, ...picked(call.replay, OPENAI_CALL_REPLAY),
      })) } : {}),
    };
  })];
}

function anthropicAssistantContent(message: AssistantMessage): Record<string, unknown>[] {
  const calls = [...(message.toolCalls ?? [])];
  const toolUse = (call: AssistantToolCall) => ({ type: 'tool_use', id: call.id, name: call.name, input: call.arguments });
  const recorded = message.replay?.content;
  if (!Array.isArray(recorded)) return [...(message.content ? [{ type: 'text', text: message.content }] : []), ...calls.map(toolUse)];
  // Copies, because the cache breakpoint is set on the outgoing blocks.
  const blocks = recorded.filter(isRecord).flatMap((block) => {
    if (block.type !== 'tool_use') return [{ ...block }];
    const call = calls.shift();
    return call ? [toolUse(call)] : [];
  });
  return [...blocks, ...calls.map(toolUse)];
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
    } else if (message.role === 'assistant') {
      result.push({ role: 'assistant', content: anthropicAssistantContent(message) });
    } else {
      result.push({ role: 'user', content: message.content ? [{ type: 'text', text: message.content }] : [] });
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
  /** Provider call IDs kept as issued. */
  callId: RegExp;
  headers: (apiKey: string) => Record<string, string>;
  body: (model: string, systemPrompt: string, messages: AssistantMessage[], definitions: AssistantToolDefinition[]) => Record<string, unknown>;
  parse: (value: unknown, definitions: AssistantToolDefinition[], nextId: (raw: unknown) => string) => AssistantCompletion;
}

// Each provider owns only wire-format translation; permissions and tool execution stay in the runner.
const adapters: Record<AssistantProviderConfig['protocol'], ProtocolAdapter> = {
  'openai-compatible': {
    path: 'chat/completions',
    // Kimi numbers its calls as functions.<name>:<index>.
    callId: /^[A-Za-z0-9_.:-]{1,64}$/,
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
    callId: /^[A-Za-z0-9_-]{1,64}$/,
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
      return adapter.parse(value, definitions, callIds(messages, adapter.callId));
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw assistantProviderFailure('adapter');
    }
  }
}
