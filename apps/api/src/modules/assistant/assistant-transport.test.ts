import { BadRequestException } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { RequestOptions } from 'node:https';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { isPublicAssistantAddress, postAssistantJson, validateAssistantBaseUrl } from './assistant-transport.js';

const { dnsLookup, httpsRequest } = vi.hoisted(() => ({ dnsLookup: vi.fn(), httpsRequest: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: dnsLookup }));
vi.mock('node:https', () => ({ request: httpsRequest }));

describe('assistant endpoint validation', () => {
  test.each([
    'http://api.example.com/v1', 'https://user:password@api.example.com/v1', 'https://api.example.com/v1?key=secret',
    'https://api.example.com/v1#fragment', 'https://localhost/v1', 'https://a.localhost./v1', 'https://box.local/v1',
    'https://127.1/v1', 'https://2130706433/v1', 'https://0x7f000001/v1', 'https://10.0.0.1/v1',
    'https://169.254.169.254/v1', 'https://100.100.100.200/v1', 'https://168.63.129.16/v1',
    'https://[::1]/v1', 'https://[::ffff:127.0.0.1]/v1', 'https://[::ffff:8.8.8.8]/v1',
    'https://[fc00::1]/v1', 'https://[fe80::1]/v1', 'https://api.example.com\\@127.0.0.1/v1',
  ])('rejects unsafe endpoint %s', (url) => {
    expect(() => validateAssistantBaseUrl(url)).toThrow(BadRequestException);
  });

  test.each(['0.0.0.0', '100.64.0.1', '172.31.1.1', '192.168.1.1', '198.18.0.1', '224.1.2.3', '255.255.255.255', '::', '::1', '64:ff9b::a00:1', '2002:7f00:1::', '2001:db8::1', '2001::1', '3fff::1'])('rejects non-public address %s', (address) => {
    expect(isPublicAssistantAddress(address)).toBe(false);
  });

  test.each(['https://api.openai.com/v1', 'https://api.anthropic.com/v1/', 'https://my-model.example.com:8443/gateway/v1', 'https://8.8.8.8/v1', 'https://[2606:4700::1111]/v1'])('permits public HTTPS base URL %s', (url) => {
    expect(validateAssistantBaseUrl(url).protocol).toBe('https:');
  });
});

describe('assistant HTTPS transport', () => {
  let options: RequestOptions | undefined;
  let response: PassThrough & { statusCode: number };
  let requestEmitter: EventEmitter & { end: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
  let responseBody: string;
  let statusCode: number;

  beforeEach(() => {
    vi.clearAllMocks();
    options = undefined;
    responseBody = '{"ok":true}';
    statusCode = 200;
    dnsLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    httpsRequest.mockImplementation((_url: URL, requestOptions: RequestOptions, callback: (result: typeof response) => void) => {
      options = requestOptions;
      requestEmitter = Object.assign(new EventEmitter(), { end: vi.fn(), destroy: vi.fn() });
      requestEmitter.end.mockImplementation(() => {
        response = Object.assign(new PassThrough(), { statusCode });
        queueMicrotask(() => { callback(response); response.end(responseBody); });
      });
      return requestEmitter;
    });
  });

  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  test('pins the validated DNS address and disables shared sockets', async () => {
    await expect(postAssistantJson(new URL('https://provider.example.com/v1/messages'), { 'x-api-key': 'secret' }, {})).resolves.toEqual({ ok: true });
    expect(dnsLookup).toHaveBeenCalledTimes(1);
    expect(options?.agent).toBe(false);
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    const callback = vi.fn();
    options?.lookup?.('provider.example.com', { all: false }, callback);
    expect(callback).toHaveBeenCalledWith(null, '8.8.8.8', 4);
    callback.mockClear();
    options?.lookup?.('provider.example.com', { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, [{ address: '8.8.8.8', family: 4 }]);
    expect(dnsLookup).toHaveBeenCalledTimes(1);
  });

  test('rejects a hostname if even one DNS answer is private', async () => {
    dnsLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }]);
    await expect(postAssistantJson(new URL('https://provider.example.com/v1/messages'), {}, {})).rejects.toMatchObject({ response: { code: 'ASSISTANT_ENDPOINT_INVALID' } });
    expect(httpsRequest).not.toHaveBeenCalled();
  });

  test('validates DNS afresh for each request after a provider rebinds', async () => {
    await postAssistantJson(new URL('https://provider.example.com/v1/messages'), {}, {});
    dnsLookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
    await expect(postAssistantJson(new URL('https://provider.example.com/v1/messages'), {}, {})).rejects.toBeInstanceOf(BadRequestException);
    expect(httpsRequest).toHaveBeenCalledTimes(1);
  });

  test.each([301, 302, 307, 401, 500])('does not follow redirects or expose upstream error bodies (%i)', async (status) => {
    statusCode = status;
    responseBody = 'secret credentials and personal data';
    const pending = postAssistantJson(new URL('https://provider.example.com/v1/messages'), {}, {});
    await expect(pending).rejects.toMatchObject({ response: { code: 'ASSISTANT_PROVIDER_FAILED' } });
    try { await pending; } catch (error) { expect(JSON.stringify(error)).not.toContain(responseBody); }
    expect(httpsRequest).toHaveBeenCalledTimes(1);
    expect(response.destroyed).toBe(true);
  });

  test.each(['{broken json', 'x'.repeat(1_048_577)])('rejects invalid JSON or an oversized response (%#)', async (body) => {
    responseBody = body;
    await expect(postAssistantJson(new URL('https://provider.example.com/v1/messages'), {}, {})).rejects.toMatchObject({ response: { code: 'ASSISTANT_PROVIDER_FAILED' } });
  });

  test('does not send oversized conversation data', async () => {
    await expect(postAssistantJson(new URL('https://provider.example.com/v1/messages'), {}, { content: 'x'.repeat(1_048_576) })).rejects.toMatchObject({ response: { code: 'ASSISTANT_CONTEXT_TOO_LARGE' } });
    expect(httpsRequest).not.toHaveBeenCalled();
  });

  test('bounds DNS resolution time without leaking resolver details', async () => {
    vi.useFakeTimers();
    dnsLookup.mockImplementation(() => new Promise(() => {}));
    const pending = postAssistantJson(new URL('https://provider.example.com/v1/messages'), {}, {});
    const assertion = expect(pending).rejects.toMatchObject({ response: { code: 'ASSISTANT_PROVIDER_TIMEOUT' } });
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
    expect(httpsRequest).not.toHaveBeenCalled();
  });

  test('aborts a stalled provider request after the total request deadline', async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    httpsRequest.mockImplementation((_url: URL, requestOptions: RequestOptions) => {
      requestEmitter = Object.assign(new EventEmitter(), { end: vi.fn(), destroy: vi.fn() });
      requestOptions.signal?.addEventListener('abort', () => requestEmitter.emit('error', new Error('secret upstream error')));
      return requestEmitter;
    });
    const pending = postAssistantJson(new URL('https://provider.example.com/v1/messages'), {}, {});
    const assertion = expect(pending).rejects.toMatchObject({ response: { code: 'ASSISTANT_PROVIDER_TIMEOUT' } });
    await vi.waitFor(() => expect(timeout).toHaveBeenCalledWith(45_000));
    controller.abort();
    await assertion;
  });

  test('sanitizes DNS failures', async () => {
    dnsLookup.mockRejectedValue(new Error('resolver leaked secret'));
    await expect(postAssistantJson(new URL('https://provider.example.com/v1/messages'), {}, {})).rejects.toMatchObject({ response: { code: 'ASSISTANT_PROVIDER_FAILED' } });
  });
});
