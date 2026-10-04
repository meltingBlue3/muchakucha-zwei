import { BadGatewayException, BadRequestException, GatewayTimeoutException, Inject, Injectable, Optional } from '@nestjs/common';
import { assistantProviderFailure, postAssistantJson, validateAssistantBaseUrl, type AssistantTransport } from './assistant-transport.js';
import type { AssistantCompletion, AssistantMessage, AssistantProviderConfig, AssistantToolCall, AssistantToolDefinition } from './assistant.types.js';

export { validateAssistantBaseUrl } from './assistant-transport.js';
export const ASSISTANT_TRANSPORT = Symbol('ASSISTANT_TRANSPORT');
const MAX_TOOL_CALLS = 8;
const MAX_CONTENT_LENGTH = 64_000;
const MAX_ARGUMENTS_LENGTH = 32_000;

function invalidResponse(): BadGatewayException {
  return new BadGatewayException({ code: 'ASSISTANT_PROVIDER_RESPONSE_INVALID', message: 'The model provider returned an invalid or incomplete response.' });
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

function textValue(value: unknown, maxLength: number, allowEmpty = true): string {
  if (typeof value !== 'string' || value.length > maxLength || (!allowEmpty && !value.trim())) throw invalidResponse();
  return value;
}

function toolCall(id: unknown, name: unknown, args: unknown, definitions: AssistantToolDefinition[]): AssistantToolCall {
  const safeId = textValue(id, 200, false);
  const safeName = textValue(name, 100, false);
  if (!/^[a-zA-Z0-9_-]+$/.test(safeId) || !definitions.some((definition) => definition.name === safeName)
    || !isRecord(args) || !isJsonValue(args) || JSON.stringify(args).length > MAX_ARGUMENTS_LENGTH) throw invalidResponse();
  return { id: safeId, name: safeName, arguments: args };
}

function completion(content: string, toolCalls: AssistantToolCall[]): AssistantCompletion {
  if ((!content.trim() && toolCalls.length === 0) || toolCalls.length > MAX_TOOL_CALLS
    || new Set(toolCalls.map((call) => call.id)).size !== toolCalls.length) throw invalidResponse();
  return { content: textValue(content, MAX_CONTENT_LENGTH), toolCalls };
}

function parseOpenAiResponse(value: unknown, definitions: AssistantToolDefinition[]): AssistantCompletion {
  if (!isRecord(value) || !Array.isArray(value.choices) || value.choices.length !== 1) throw invalidResponse();
  const choice: unknown = value.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message) || choice.message.role !== 'assistant') throw invalidResponse();
  const message = choice.message;
  if (choice.finish_reason !== 'stop' && choice.finish_reason !== 'tool_calls') throw invalidResponse();
  const content = message.content === null ? '' : textValue(message.content, MAX_CONTENT_LENGTH);
  if (message.tool_calls !== undefined && (!Array.isArray(message.tool_calls) || message.tool_calls.length > MAX_TOOL_CALLS)) throw invalidResponse();
  const calls: unknown[] = message.tool_calls === undefined ? [] : message.tool_calls as unknown[];
  if ((choice.finish_reason === 'tool_calls') !== (calls.length > 0)) throw invalidResponse();
  return completion(content, calls.map((call) => {
    if (!isRecord(call) || call.type !== 'function' || !isRecord(call.function)) throw invalidResponse();
    const encoded = textValue(call.function.arguments, MAX_ARGUMENTS_LENGTH, false);
    let args: unknown;
    try { args = JSON.parse(encoded) as unknown; } catch { throw invalidResponse(); }
    return toolCall(call.id, call.function.name, args, definitions);
  }));
}

function parseAnthropicResponse(value: unknown, definitions: AssistantToolDefinition[]): AssistantCompletion {
  if (!isRecord(value) || value.type !== 'message' || value.role !== 'assistant' || !Array.isArray(value.content)
    || value.content.length > 64 || (value.stop_reason !== 'end_turn' && value.stop_reason !== 'tool_use')) throw invalidResponse();
  const text: string[] = [];
  const calls: AssistantToolCall[] = [];
  for (const block of value.content as unknown[]) {
    if (!isRecord(block)) throw invalidResponse();
    if (block.type === 'text') text.push(textValue(block.text, MAX_CONTENT_LENGTH));
    else if (block.type === 'tool_use') calls.push(toolCall(block.id, block.name, block.input, definitions));
    else throw invalidResponse();
  }
  if ((value.stop_reason === 'tool_use') !== (calls.length > 0)) throw invalidResponse();
  return completion(text.join('\n'), calls);
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
      const block = { type: 'tool_result', tool_use_id: message.toolCallId, content: message.content };
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
      model, stream: false, max_completion_tokens: 4_096,
      messages: openAiMessages(systemPrompt, messages),
      ...(definitions.length ? {
        tools: definitions.map((definition) => ({ type: 'function', function: { name: definition.name, description: definition.description, parameters: definition.parameters } })),
        tool_choice: 'auto', parallel_tool_calls: false,
      } : {}),
    }),
    parse: parseOpenAiResponse,
  },
  anthropic: {
    path: 'messages',
    headers: (apiKey) => ({ 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }),
    body: (model, systemPrompt, messages, definitions) => ({
      model, stream: false, max_tokens: 4_096, system: systemPrompt,
      messages: anthropicMessages(messages),
      ...(definitions.length ? {
        tools: definitions.map((definition) => ({ name: definition.name, description: definition.description, input_schema: definition.parameters })),
        tool_choice: { type: 'auto', disable_parallel_tool_use: true },
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
      if (error instanceof BadRequestException || error instanceof BadGatewayException || error instanceof GatewayTimeoutException) throw error;
      throw assistantProviderFailure();
    }
  }
}
