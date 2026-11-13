import { useTranslation } from '../../i18n';
import { zh, type Catalog } from '../../i18n/locales/zh';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError, type AssistantProviderResponseDto } from '@muchakucha/api-client';
import { sessionTransport } from '../auth/session-runtime';

/** A configuration's protocol fixes its use: conversations run on chat models, voice input on a transcription service. */
export function isTranscriptionProvider(provider: Pick<AssistantProviderResponseDto, 'protocol'>): boolean {
  return provider.protocol === 'qwen-asr';
}

export function chatProviders(providers: AssistantProviderResponseDto[]): AssistantProviderResponseDto[] {
  return providers.filter(provider => !isTranscriptionProvider(provider));
}

/** The transcription configuration voice input uses: the user's own first, then one shared with the household. */
export function transcriptionProvider(providers: AssistantProviderResponseDto[]): AssistantProviderResponseDto | null {
  const usable = providers.filter(provider => isTranscriptionProvider(provider) && provider.hasCredential);
  return usable.find(provider => provider.ownedByMe) ?? usable[0] ?? null;
}

export type AssistantErrorKey =
  | `errors.${keyof Catalog['assistant']['errors']}`
  | `errorCodes.${keyof Catalog['assistant']['errorCodes']}`
  | `transcriptionCodes.${keyof Catalog['assistant']['transcriptionCodes']}`;

class AssistantSessionExpired extends Error {}

export function assistantErrorKey<Fallback extends string>(error: unknown, fallback: Fallback): AssistantErrorKey | Fallback {
  if (error instanceof AssistantSessionExpired) return 'errors.expired';
  if (error instanceof ApiClientError) {
    const code = (error.body as { error?: { code?: string } } | null)?.error?.code;
    if (code !== undefined && Object.hasOwn(zh.assistant.errorCodes, code)) return `errorCodes.${code as keyof Catalog['assistant']['errorCodes']}`;
    if (error.status === 401) return 'errors.expired';
    if (error.status === 403) return 'errors.forbidden';
    if (error.status === 404) return 'errors.notFound';
    if (error.status === 409) return 'errors.conflict';
    if (error.status === 429) return 'errors.rateLimited';
    if (error.status === 502 || error.status === 503 || error.status === 504) return 'errors.providerError';
    if (error.status === 400) return 'errors.invalid';
  }
  return fallback;
}

/** Chat wording speaks of tool calls; a transcription failure is about the recording and the service. */
export function transcriptionErrorKey<Fallback extends string>(error: unknown, fallback: Fallback): AssistantErrorKey | Fallback {
  const code = error instanceof ApiClientError ? (error.body as { error?: { code?: string } } | null)?.error?.code : undefined;
  return code !== undefined && Object.hasOwn(zh.assistant.transcriptionCodes, code)
    ? `transcriptionCodes.${code as keyof Catalog['assistant']['transcriptionCodes']}`
    : assistantErrorKey(error, fallback);
}

export async function assistantToken(): Promise<string> {
  const token = await sessionTransport.getAccessToken();
  if (token === null) throw new AssistantSessionExpired();
  return token;
}

/** Callers are keyed by household. A blurred or unmounted screen cannot accept a late response. */
export function useAssistantQuery<T>(fetcher: (token: string) => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation('assistant');
  const [error, setError] = useState<AssistantErrorKey | null>(null);
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
      if (request === generation.current) setError(assistantErrorKey(failure, 'errors.load'));
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
  return { data, setData, loading, error: error === null ? null : t(error), reload };
}

export function useAssistantOperation() {
  const [busy, setBusy] = useState(false);
  const { t } = useTranslation('assistant');
  const [error, setError] = useState<AssistantErrorKey | null>(null);
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
      if (alive.current) setError(assistantErrorKey(failure, 'errors.generic'));
      return undefined;
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return { busy, error: error === null ? null : t(error), run };
}
