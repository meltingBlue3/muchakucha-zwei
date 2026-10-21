import { BadRequestException, HttpException, Inject, Injectable, Optional } from '@nestjs/common';
import { ASSISTANT_TRANSPORT, validConfig } from './assistant-provider.js';
import {
  AssistantProviderFailure, assistantProviderFailure, postAssistantJson, validateAssistantBaseUrl, type AssistantTransport,
} from './assistant-transport.js';
import { isTranscriptionProtocol, type AssistantAudio, type AssistantProviderConfig, type AssistantTranscription } from './assistant.types.js';

/** A minute of speech is a few hundred characters; anything far longer is not a transcript. */
const MAX_TRANSCRIPT_LENGTH = 4_000;

function invalidResponse(diagnostic: string): AssistantProviderFailure {
  return new AssistantProviderFailure('ASSISTANT_PROVIDER_RESPONSE_INVALID', 'The transcription service returned an invalid or incomplete response.', diagnostic);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function tokens(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/** Qwen-ASR answers in the chat completion shape. Its reference documents the content as an
 * array of text parts while its examples return a string, so both are read. */
function parseQwenResponse(value: unknown): AssistantTranscription {
  if (!isRecord(value) || !Array.isArray(value.choices) || value.choices.length !== 1) throw invalidResponse('choices invalid');
  const choice: unknown = value.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) throw invalidResponse('message invalid');
  if (choice.finish_reason !== undefined && choice.finish_reason !== null && choice.finish_reason !== 'stop') throw invalidResponse('finish_reason');
  const content: unknown = choice.message.content;
  const parts: unknown[] = Array.isArray(content) ? content as unknown[] : [content ?? ''];
  const text = parts.map((part) => {
    if (typeof part === 'string') return part;
    if (isRecord(part) && typeof part.text === 'string') return part.text;
    throw invalidResponse('content invalid');
  }).join('');
  if (text.length > MAX_TRANSCRIPT_LENGTH) throw invalidResponse('content too long');
  const usage = isRecord(value.usage) ? { inputTokens: tokens(value.usage.prompt_tokens), outputTokens: tokens(value.usage.completion_tokens) } : undefined;
  return { text: text.trim(), ...(usage ? { usage } : {}) };
}

/** One second of 16 kHz mono silence: enough for a connection check to reach recognition without sending speech. */
export function silentWav(): AssistantAudio {
  const samples = 16_000;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + samples * 2, 4);
  header.write('WAVEfmt ', 8, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16_000, 24);
  header.writeUInt32LE(32_000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(samples * 2, 40);
  return { data: Buffer.concat([header, Buffer.alloc(samples * 2)]).toString('base64'), mimeType: 'audio/wav' };
}

@Injectable()
export class AssistantTranscriber {
  constructor(@Optional() @Inject(ASSISTANT_TRANSPORT) private readonly transport: AssistantTransport = postAssistantJson) {}

  async transcribe(config: AssistantProviderConfig, audio: AssistantAudio): Promise<AssistantTranscription> {
    const url = validateAssistantBaseUrl(config.baseUrl);
    if (!isTranscriptionProtocol(config.protocol) || !validConfig(config)) {
      throw new BadRequestException({ code: 'ASSISTANT_PROVIDER_CONFIG_INVALID', message: 'The transcription configuration is invalid.' });
    }
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/chat/completions`;
    try {
      const value = await this.transport(url, { authorization: `Bearer ${config.apiKey}` }, {
        model: config.model, stream: false,
        messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: `data:${audio.mimeType};base64,${audio.data}` } }] }],
        // Mandarin by default; inverse text normalization writes times and dates as digits ("3点" rather than "三点").
        asr_options: { language: 'zh', enable_itn: true },
      });
      return parseQwenResponse(value);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw assistantProviderFailure('adapter');
    }
  }
}
