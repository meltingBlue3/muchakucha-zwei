export interface AssistantToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  mutates: boolean;
}

export interface AssistantToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AssistantMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: AssistantToolCall[];
  toolCallId?: string;
  /** When a user message was sent; relative dates in it are read against this instant. */
  sentAt?: string;
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
}

export interface AssistantActor {
  userId: string;
  householdId: string;
}

/** Tools also read the conversation's time zone; like the scope, it never comes from the model. */
export interface AssistantToolActor extends AssistantActor {
  timeZone: string;
}
