import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError } from '@muchakucha/api-client';
import { sessionTransport } from '../auth/session-runtime';

export function assistantError(error: unknown, fallback = '这次操作未能完成，请检查网络后重试。'): string {
  if (error instanceof ApiClientError) {
    const body = error.body as { error?: { code?: string } } | null;
    const code = body?.error?.code;
    if (code === 'ASSISTANT_NOT_CONFIGURED') return '助手尚未启用，请联系服务管理员配置凭证加密密钥。';
    if (code === 'ASSISTANT_PROVIDER_CHANGED') return '这段对话的模型配置已变更。请返回查看最新配置，并创建新的对话。';
    if (code === 'ASSISTANT_BUSY') return '助手仍在处理，请刷新对话查看结果。';
    if (code === 'ASSISTANT_CONFIRMATION_REQUIRED') return '请先确认或取消待执行的操作。';
    if (code === 'ASSISTANT_LIMIT_REACHED') return '这段对话已达到使用上限，请创建新的对话。';
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
  const reload = useCallback(async () => {
    if (!active.current) return;
    const request = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const token = await assistantToken();
      if (request !== generation.current) return;
      const result = await fetcher(token);
      if (request === generation.current) setData(result);
    } catch (failure) {
      if (request === generation.current) setError(assistantError(failure, '暂时无法加载助手内容，请检查网络后重试。'));
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
