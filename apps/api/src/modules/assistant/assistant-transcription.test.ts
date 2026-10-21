import { describe, expect, test, vi } from 'vitest';
import { AssistantProvider } from './assistant-provider.js';
import { AssistantTranscriber, silentWav } from './assistant-transcription.js';
import { AssistantProviderFailure, type AssistantTransport } from './assistant-transport.js';
import type { AssistantProviderConfig } from './assistant.types.js';

const config: AssistantProviderConfig = { protocol: 'qwen-asr', baseUrl: 'https://dashscope.example.com/compatible-mode/v1/', model: 'qwen3-asr-flash', apiKey: 'secret-for-tests' };
const audio = { data: 'AAAAGGZ0eXBNNEEg', mimeType: 'audio/mp4' as const };

function qwenResponse(content: unknown, finish: unknown = 'stop', usage: unknown = { prompt_tokens: 75, completion_tokens: 9, seconds: 3 }): unknown {
  return { choices: [{ finish_reason: finish, message: { role: 'assistant', content, annotations: [{ type: 'audio_info', language: 'zh' }] } }], usage };
}

describe('Qwen-ASR transcription', () => {
  test('sends the recording as a data URL in one chat completion and returns trimmed text with usage', async () => {
    const transport = vi.fn<AssistantTransport>().mockResolvedValue(qwenResponse(' 明天下午3点接孩子。 '));
    await expect(new AssistantTranscriber(transport).transcribe(config, audio)).resolves.toEqual({ text: '明天下午3点接孩子。', usage: { inputTokens: 75, outputTokens: 9 } });
    expect(transport).toHaveBeenCalledWith(new URL('https://dashscope.example.com/compatible-mode/v1/chat/completions'), { authorization: 'Bearer secret-for-tests' }, {
      model: 'qwen3-asr-flash', stream: false,
      messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: 'data:audio/mp4;base64,AAAAGGZ0eXBNNEEg' } }] }],
      asr_options: { language: 'zh', enable_itn: true },
    });
  });

  test('reads content as a string or as text parts, and silence as empty text', async () => {
    const transport = vi.fn<AssistantTransport>()
      .mockResolvedValueOnce(qwenResponse([{ text: '周六' }, { text: '9:30' }], null, null))
      .mockResolvedValueOnce(qwenResponse(''));
    const transcriber = new AssistantTranscriber(transport);
    await expect(transcriber.transcribe(config, audio)).resolves.toEqual({ text: '周六9:30' });
    await expect(transcriber.transcribe(config, audio)).resolves.toMatchObject({ text: '' });
  });

  test.each([
    ['no choices', { choices: [] }],
    ['an unexpected finish reason', qwenResponse('部分', 'length')],
    ['a non-text part', qwenResponse([{ audio: 'x' }])],
    ['an implausibly long transcript', qwenResponse('字'.repeat(4_001))],
  ])('rejects %s as an invalid response', async (_case, value) => {
    const transport = vi.fn<AssistantTransport>().mockResolvedValue(value);
    await expect(new AssistantTranscriber(transport).transcribe(config, audio)).rejects.toMatchObject({ response: { code: 'ASSISTANT_PROVIDER_RESPONSE_INVALID' } });
  });

  test('upstream failures keep their stable code', async () => {
    const failure = new AssistantProviderFailure('ASSISTANT_PROVIDER_AUTH_FAILED', 'The model provider rejected the credential.', 'status 401');
    const transport = vi.fn<AssistantTransport>().mockRejectedValue(failure);
    await expect(new AssistantTranscriber(transport).transcribe(config, audio)).rejects.toBe(failure);
  });

  test('chat and transcription configurations cannot stand in for each other', async () => {
    const transport = vi.fn<AssistantTransport>();
    await expect(new AssistantTranscriber(transport).transcribe({ ...config, protocol: 'openai-compatible' }, audio))
      .rejects.toMatchObject({ response: { code: 'ASSISTANT_PROVIDER_CONFIG_INVALID' } });
    await expect(new AssistantProvider(transport).complete(config, 'System', [{ role: 'user', content: '你好' }], []))
      .rejects.toMatchObject({ response: { code: 'ASSISTANT_PROVIDER_CONFIG_INVALID' } });
    expect(transport).not.toHaveBeenCalled();
  });

  test('the connection check sends one second of 16 kHz mono silence', () => {
    const wav = Buffer.from(silentWav().data, 'base64');
    expect(wav.length).toBe(44 + 32_000);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.readUInt32LE(24)).toBe(16_000);
    expect(wav.subarray(44).every(byte => byte === 0)).toBe(true);
  });
});
