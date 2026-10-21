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

export const ASSISTANT_CHAT_PROTOCOLS = ['openai-compatible', 'anthropic'] as const;
export const ASSISTANT_TRANSCRIPTION_PROTOCOLS = ['qwen-asr'] as const;
export const ASSISTANT_PROTOCOLS = [...ASSISTANT_CHAT_PROTOCOLS, ...ASSISTANT_TRANSCRIPTION_PROTOCOLS] as const;
export type AssistantChatProtocol = typeof ASSISTANT_CHAT_PROTOCOLS[number];
/** A configuration's protocol fixes its use: chat drives conversations, transcription turns voice input into text. */
export type AssistantProtocol = typeof ASSISTANT_PROTOCOLS[number];

export function isTranscriptionProtocol(protocol: string): protocol is typeof ASSISTANT_TRANSCRIPTION_PROTOCOLS[number] {
  return (ASSISTANT_TRANSCRIPTION_PROTOCOLS as readonly string[]).includes(protocol);
}

export interface AssistantProviderConfig {
  protocol: AssistantProtocol;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export const ASSISTANT_AUDIO_TYPES = ['audio/mp4', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/mpeg'] as const;

/** A short recording held in memory only; it is never written to disk or the database. */
export interface AssistantAudio {
  /** Base64, without a data: prefix. */
  data: string;
  mimeType: typeof ASSISTANT_AUDIO_TYPES[number];
}

export interface AssistantTranscription {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
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
