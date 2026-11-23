import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { currentLanguage } from '../../i18n';
import { sessionApiClient, sessionStateStore } from '../auth/session-runtime';
import { assistantPath } from './assistant-boundary';
import { assistantErrorKey, assistantToken, type AssistantErrorKey } from './assistant-runtime';

type Language = ReturnType<typeof currentLanguage>;

export async function loadConversation(token: string, householdId: string, conversationId: string, language: Language, signal?: AbortSignal) {
  const [conversation, providers, history] = await Promise.all([
    sessionApiClient.getAssistantConversation(token, householdId, conversationId, signal, language),
    sessionApiClient.listAssistantProviders(token, householdId, signal),
    sessionApiClient.listAssistantConversations(token, householdId, signal),
  ]);
  return { conversation, providers: providers.providers, history: history.conversations };
}

type ConversationData = Awaited<ReturnType<typeof loadConversation>>;
type PreparedConversation = {
  householdId: string;
  language: Language;
  session: ReturnType<typeof sessionStateStore.get>;
  data: ConversationData;
  expiry: ReturnType<typeof setTimeout>;
};

// The incoming route reads this one-time snapshot for its first render. Private conversation
// data stays in memory and is usable only for the matching household, language and session.
let prepared: PreparedConversation | null = null;

export function readPreparedConversation(householdId: string, conversationId: string): ConversationData | null {
  if (prepared?.householdId === householdId && prepared.data.conversation.id === conversationId
    && prepared.language === currentLanguage() && prepared.session === sessionStateStore.get()) return prepared.data;
  return null;
}

export function discardPreparedConversation(data: ConversationData | null) {
  if (prepared?.data !== data) return;
  clearTimeout(prepared.expiry);
  prepared = null;
}

export function useConversationNavigation(householdId: string, busy: boolean) {
  const router = useRouter();
  const request = useRef<AbortController | null>(null);
  const [selection, setSelection] = useState<{ id: string; error: AssistantErrorKey | null } | null>(null);
  const cancel = useCallback(() => {
    request.current?.abort();
    request.current = null;
    setSelection(null);
  }, []);

  useFocusEffect(useCallback(() => {
    cancel();
    return () => request.current?.abort();
  }, [busy, cancel]));

  const open = async (id: string, onReady: () => void) => {
    if (busy || (selection?.id === id && request.current && !request.current.signal.aborted)) return;
    const initialSession = sessionStateStore.get();
    if (initialSession.kind !== 'authenticated') return;
    request.current?.abort();
    const controller = new AbortController();
    const { signal } = controller;
    request.current = controller;
    setSelection({ id, error: null });
    try {
      const language = currentLanguage();
      const token = await assistantToken();
      if (signal.aborted) return;
      const data = await loadConversation(token, householdId, id, language, signal);
      if (signal.aborted) return;
      const session = sessionStateStore.get();
      if (session.kind !== 'authenticated' || session.session.currentUser?.id !== initialSession.session.currentUser?.id || language !== currentLanguage()) {
        setSelection(null);
        return;
      }
      if (prepared) discardPreparedConversation(prepared.data);
      prepared = { householdId, language, session, data, expiry: setTimeout(() => { prepared = null; }, 5_000) };
      onReady();
      router.push(`${assistantPath(householdId)}/conversations/${encodeURIComponent(id)}`);
    } catch (error) {
      if (!signal.aborted) {
        controller.abort();
        setSelection({ id, error: assistantErrorKey(error, 'errors.load') });
      }
    } finally {
      if (request.current === controller) request.current = null;
    }
  };

  return { selection, open, cancel };
}
