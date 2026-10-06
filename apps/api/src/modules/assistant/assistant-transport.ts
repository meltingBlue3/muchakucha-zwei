import { BadGatewayException, BadRequestException, GatewayTimeoutException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';

const MAX_BODY_BYTES = 1_048_576;
const MAX_ERROR_BODY_BYTES = 16_384;
const REQUEST_TIMEOUT_MS = 45_000;
const DNS_TIMEOUT_MS = 5_000;
const blockedV4 = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blockedV4.addSubnet(address, prefix, 'ipv4');
blockedV4.addAddress('168.63.129.16', 'ipv4'); // Azure platform / metadata services.

const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
const blockedV6 = new BlockList();
blockedV6.addSubnet('2001::', 23, 'ipv6'); // Special-purpose ranges, including Teredo.
blockedV6.addSubnet('2001:db8::', 32, 'ipv6');
blockedV6.addSubnet('2002::', 16, 'ipv6'); // 6to4 can encode a private IPv4 destination.
blockedV6.addSubnet('3fff::', 20, 'ipv6');

export function isPublicAssistantAddress(address: string): boolean {
  if (isIP(address) === 4) return !blockedV4.check(address, 'ipv4');
  if (isIP(address) !== 6 || address.includes('%')) return false;
  // An allowlist excludes loopback, link-local, ULA, IPv4-mapped and NAT64 ranges.
  return globalV6.check(address, 'ipv6') && !blockedV6.check(address, 'ipv6');
}

function unsafeEndpoint(): BadRequestException {
  return new BadRequestException({
    code: 'ASSISTANT_ENDPOINT_INVALID',
    message: 'The assistant endpoint must be a public HTTPS URL without credentials, query or fragment.',
  });
}

/** `diagnostic` is a short structural note for server logs, such as a status or socket error code.
 * Upstream text and credentials never leave this module; clients receive only the stable code. */
export class AssistantProviderFailure extends BadGatewayException {
  constructor(code: string, message: string, readonly diagnostic: string) {
    super({ code, message });
  }
}

export function assistantProviderFailure(diagnostic = 'transport'): AssistantProviderFailure {
  return new AssistantProviderFailure('ASSISTANT_PROVIDER_FAILED', 'The model provider request failed. Check the endpoint, model and credentials.', diagnostic);
}

const upstreamFailures = {
  AUTH_FAILED: 'The model provider rejected the credential.',
  QUOTA_EXCEEDED: 'The model provider account has no remaining quota.',
  RATE_LIMITED: 'The model provider is limiting requests.',
  ENDPOINT_NOT_FOUND: 'The model provider does not know this endpoint or model.',
  CONTEXT_TOO_LONG: 'The conversation exceeds the model context window.',
  TOOLS_UNSUPPORTED: 'The model does not support tool calls.',
  UNAVAILABLE: 'The model provider is unavailable.',
  REJECTED: 'The model provider rejected the request.',
} as const;

function classifyUpstream(status: number, text: string): keyof typeof upstreamFailures {
  if (status === 401 || status === 403 || /api[_ -]?key|unauthori[sz]ed|authentication/.test(text)) return 'AUTH_FAILED';
  if (status === 402 || /insufficient[_ ]?(quota|balance|funds)|exceeded your current quota|credit balance|billing|arrearage|余额不足|欠费/.test(text)) return 'QUOTA_EXCEEDED';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 404 || /model.{0,40}(not[ _]?(found|exist)|does not exist)|(unknown|invalid) model/.test(text)) return 'ENDPOINT_NOT_FOUND';
  if (status === 413 || /context[_ ]?(length|window)|maximum context|too many tokens|prompt is too long|input is too long|token limit/.test(text)) return 'CONTEXT_TOO_LONG';
  if (/(tools?|function[_ ]?call(ing)?|tool[_ ]choice).{0,60}(not supported|unsupported|does not support|not support)|(not supported|unsupported|does not support).{0,60}(tools?\b|function)/.test(text)) return 'TOOLS_UNSUPPORTED';
  return status >= 500 ? 'UNAVAILABLE' : 'REJECTED';
}

/** Classified from the status and a bounded error body read on the server; the body is then discarded. */
export function upstreamFailure(status: number, body: string): AssistantProviderFailure {
  const kind = classifyUpstream(status, body.toLowerCase());
  return new AssistantProviderFailure(`ASSISTANT_PROVIDER_${kind}`, upstreamFailures[kind], `status ${status}`);
}

function connectionFailure(error: unknown): AssistantProviderFailure {
  const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' && /^[A-Z_]{1,40}$/.test(error.code) ? error.code : 'unknown';
  return assistantProviderFailure(`connection ${code}`);
}

function providerTimeout(): GatewayTimeoutException {
  return new GatewayTimeoutException({ code: 'ASSISTANT_PROVIDER_TIMEOUT', message: 'The model provider did not respond in time.' });
}

function hostnameOf(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, '');
}

/** Save-time checks. DNS is checked again and pinned on every actual request. */
export function validateAssistantBaseUrl(value: string): URL {
  if (typeof value !== 'string' || value.length > 2_048 || /[\s\\?#]/u.test(value)) throw unsafeEndpoint();
  let url: URL;
  try { url = new URL(value); } catch { throw unsafeEndpoint(); }
  const hostname = hostnameOf(url);
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || !hostname || /(^|\.)(localhost|local|internal)$/.test(normalized)
    || (isIP(hostname) !== 0 && !isPublicAssistantAddress(hostname))) throw unsafeEndpoint();
  return url;
}

async function resolvePublicAddress(hostname: string): Promise<{ address: string; family: 4 | 6 }> {
  const literalFamily = isIP(hostname);
  if (literalFamily === 4 || literalFamily === 6) {
    if (!isPublicAssistantAddress(hostname)) throw unsafeEndpoint();
    return { address: hostname, family: literalFamily };
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const records = await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(providerTimeout()), DNS_TIMEOUT_MS); }),
    ]);
    if (records.length === 0 || records.length > 64 || records.some((record) => !isPublicAssistantAddress(record.address))) throw unsafeEndpoint();
    const selected = records[0];
    if (!selected || (selected.family !== 4 && selected.family !== 6) || isIP(selected.address) !== selected.family) throw unsafeEndpoint();
    return { address: selected.address, family: selected.family };
  } catch (error) {
    if (error instanceof BadRequestException || error instanceof GatewayTimeoutException) throw error;
    throw assistantProviderFailure('dns');
  } finally { clearTimeout(timer); }
}

export type AssistantTransport = (url: URL, headers: Record<string, string>, body: Record<string, unknown>) => Promise<unknown>;

/** No redirects, proxies, shared sockets or DNS re-resolution after validation. */
export const postAssistantJson: AssistantTransport = async (url, headers, body) => {
  validateAssistantBaseUrl(url.href);
  const selected = await resolvePublicAddress(hostnameOf(url));
  const payload = JSON.stringify(body);
  if (Buffer.byteLength(payload) > MAX_BODY_BYTES) throw new BadRequestException({ code: 'ASSISTANT_CONTEXT_TOO_LARGE', message: 'The assistant conversation is too large.' });
  return new Promise<unknown>((resolve, reject) => {
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const req = request(url, {
      method: 'POST',
      agent: false,
      family: selected.family,
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [selected]);
        else callback(null, selected.address, selected.family);
      },
      signal,
      headers: { ...headers, 'content-type': 'application/json', accept: 'application/json', 'content-length': Buffer.byteLength(payload) },
    }, (response) => {
      // Never forward Location, response bodies or raw transport errors to clients.
      const status = response.statusCode;
      if (status === undefined || status < 200 || status >= 300) {
        if (status === undefined || status < 400) {
          response.destroy();
          reject(assistantProviderFailure(`status ${status ?? 'missing'}`));
          return;
        }
        // An error body is read only far enough to tell a bad key from a full context window.
        const errorChunks: Buffer[] = [];
        let errorSize = 0;
        const settle = () => {
          response.destroy();
          reject(upstreamFailure(status, Buffer.concat(errorChunks).toString('utf8')));
        };
        response.on('data', (chunk: Buffer) => {
          errorChunks.push(chunk);
          errorSize += chunk.length;
          if (errorSize >= MAX_ERROR_BODY_BYTES) settle();
        });
        response.on('end', settle);
        response.on('error', () => reject(signal.aborted ? providerTimeout() : upstreamFailure(status, '')));
        response.on('aborted', () => reject(signal.aborted ? providerTimeout() : upstreamFailure(status, '')));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          response.destroy();
          req.destroy();
          reject(assistantProviderFailure('response too large'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('error', (error) => reject(signal.aborted ? providerTimeout() : connectionFailure(error)));
      response.on('aborted', () => reject(signal.aborted ? providerTimeout() : assistantProviderFailure('response aborted')));
      response.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown); }
        catch { reject(assistantProviderFailure('response not json')); }
      });
    });
    req.on('error', (error) => reject(signal.aborted ? providerTimeout() : connectionFailure(error)));
    req.end(payload);
  });
};
