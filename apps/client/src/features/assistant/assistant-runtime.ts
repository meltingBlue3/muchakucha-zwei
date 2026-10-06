import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError } from '@muchakucha/api-client';
import { sessionTransport } from '../auth/session-runtime';

const errorMessages: Record<string, string> = {
  ASSISTANT_NOT_CONFIGURED: '助手尚未启用，请联系服务管理员配置凭证加密密钥。',
  ASSISTANT_CREDENTIAL_UNAVAILABLE: '无法读取这项配置的 API 密钥。请配置创建者重新填写密钥。',
  ASSISTANT_PROVIDER_CHANGED: '这段对话的模型配置已变更。请返回查看最新配置，并创建新的对话。',
  ASSISTANT_BUSY: '助手仍在处理，请刷新对话查看结果。',
  ASSISTANT_CONFIRMATION_REQUIRED: '请先确认或取消待执行的操作。',
  ASSISTANT_CONVERSATION_FULL: '这段对话已经太长，请创建新的对话继续。',
  ASSISTANT_CONVERSATION_LIMIT_REACHED: '已有 100 段对话，请先删除不再需要的对话。',
  ASSISTANT_PROVIDER_LIMIT_REACHED: '你在这个家庭已有 20 项模型配置，请先删除不用的配置。',
  ASSISTANT_ENDPOINT_INVALID: '服务地址只能是公网 HTTPS 地址，不能带用户名、密码、查询参数或片段。',
  ASSISTANT_PROVIDER_AUTH_FAILED: '模型服务拒绝了 API 密钥，请检查或更新密钥。',
  ASSISTANT_PROVIDER_QUOTA_EXCEEDED: '模型服务账户额度不足，请检查余额或套餐。',
  ASSISTANT_PROVIDER_RATE_LIMITED: '模型服务请求过于频繁，请稍后重试。',
  ASSISTANT_PROVIDER_ENDPOINT_NOT_FOUND: '模型服务找不到这个地址或模型，请检查服务地址（API 基础目录）和模型名称。',
  ASSISTANT_PROVIDER_CONTEXT_TOO_LONG: '内容超出了模型能处理的长度。',
  ASSISTANT_PROVIDER_TOOLS_UNSUPPORTED: '这个模型不支持工具调用，请换用支持工具调用的模型。',
  ASSISTANT_PROVIDER_REJECTED: '模型服务拒绝了请求，请确认模型名称正确且支持工具调用。',
  ASSISTANT_PROVIDER_FOLLOW_UP_REJECTED: '模型调用了工具，但模型服务拒绝了带回工具结果的后续请求。这个模型的多轮工具调用方式可能与助手不兼容，请换用同一服务的其他模型。',
  ASSISTANT_PROVIDER_REASONING_REQUIRED: '这个模型要求带回它之前的思考内容，助手没能满足。请换用同一服务的非思考模型。',
  ASSISTANT_PROVIDER_UNAVAILABLE: '模型服务暂时不可用，请稍后重试。',
  ASSISTANT_PROVIDER_TIMEOUT: '模型服务响应超时，请稍后重试。',
  ASSISTANT_PROVIDER_FAILED: '无法连接模型服务，请确认服务地址能从服务器访问。',
  ASSISTANT_PROVIDER_RESPONSE_INVALID: '模型返回了无法识别的结果，这个服务可能与所选协议不完全兼容。',
  ASSISTANT_PROVIDER_OUTPUT_TRUNCATED: '模型输出达到长度上限，没能完成。',
  ASSISTANT_PROVIDER_REFUSED: '模型拒绝处理这个请求。',
};

export function assistantError(error: unknown, fallback = '这次操作未能完成，请检查网络后重试。'): string {
  if (error instanceof ApiClientError) {
    const body = error.body as { error?: { code?: string } } | null;
    const code = body?.error?.code;
    if (code !== undefined && Object.hasOwn(errorMessages, code)) return errorMessages[code]!;
    if (error.status === 401) return '登录已过期，请重新登录。';
    if (error.status === 403) return '你已无权使用这项配置或家庭内容，请刷新后重试。';
    if (error.status === 404) return '这项内容已删除或不再共享，请返回后刷新。';
    if (error.status === 409) return '内容已有变化，请刷新后查看最新结果，再继续操作。';
    if (error.status === 429) return '请求过于频繁，请稍后重试。';
    if (error.status === 502 || error.status === 503 || error.status === 504) return '模型服务暂时不可用，请检查模型配置和凭证，稍后重试。';
    if (error.status === 400) return '请检查填写的内容、模型地址和模型名称后重试。';
  }
  return error instanceof Error && error.message === '登录已过期，请重新登录。' ? error.message : fallback;
}

export async function assistantToken(): Promise<string> {
  const token = await sessionTransport.getAccessToken();
  if (token === null) throw new Error('登录已过期，请重新登录。');
  return token;
}

/** Callers are keyed by household. A blurred or unmounted screen cannot accept a late response. */
export function useAssistantQuery<T>(fetcher: (token: string) => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const active = useRef(false);
  /** Resolves with the loaded value, or undefined when the load failed or was superseded. */
  const reload = useCallback(async (): Promise<T | undefined> => {
    if (!active.current) return undefined;
    const request = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const token = await assistantToken();
      if (request !== generation.current) return undefined;
      const result = await fetcher(token);
      if (request !== generation.current) return undefined;
      setData(result);
      return result;
    } catch (failure) {
      if (request === generation.current) setError(assistantError(failure, '暂时无法加载助手内容，请检查网络后重试。'));
      return undefined;
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [fetcher]);
  useFocusEffect(useCallback(() => {
    active.current = true;
    void reload();
    return () => { active.current = false; generation.current += 1; };
  }, [reload]));
  return { data, setData, loading, error, reload };
}

export function useAssistantOperation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const alive = useRef(true);
  const focused = useRef(false);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => { focused.current = false; };
  }, []));
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const run = async <T,>(operation: (token: string) => Promise<T>): Promise<{ value: T } | undefined> => {
    if (running.current) return undefined;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      const token = await assistantToken();
      if (!alive.current || !focused.current) return undefined;
      const value = await operation(token);
      return alive.current && focused.current ? { value } : undefined;
    } catch (failure) {
      if (alive.current) setError(assistantError(failure));
      return undefined;
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return { busy, error, run };
}
