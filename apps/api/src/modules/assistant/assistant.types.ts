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
}

export interface AssistantActor {
  userId: string;
  householdId: string;
}
