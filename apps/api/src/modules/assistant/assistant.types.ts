export interface AssistantToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  mutates: boolean;
}

/** Provider fields that later requests must carry back unchanged, such as a thinking model's
 * reasoning or a thought signature. Only the protocol adapter that produced them reads them. */
export type AssistantReplay = Record<string, unknown>;

export interface AssistantToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  replay?: AssistantReplay;
}

export interface AssistantMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: AssistantToolCall[];
  toolCallId?: string;
  /** When a user message was sent; relative dates in it are read against this instant. */
  sentAt?: string;
  replay?: AssistantReplay;
}

export interface AssistantProviderConfig {
  protocol: 'openai-compatible' | 'anthropic';
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface AssistantCompletion {
  content: string;
  toolCalls: AssistantToolCall[];
  /** The answer stopped at the output limit. */
  truncated?: boolean;
  /** Token counts the provider reported for this request, when it reported them. */
  usage?: { inputTokens: number; outputTokens: number };
  /** Stored on the assistant message this completion becomes. */
  replay?: AssistantReplay;
}

export interface AssistantActor {
  userId: string;
  householdId: string;
}

/** Tools also read the conversation's time zone; like the scope, it never comes from the model. */
export interface AssistantToolActor extends AssistantActor {
  timeZone: string;
}
