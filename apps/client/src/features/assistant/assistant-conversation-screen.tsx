import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import ListChecks from 'lucide-react-native/icons/list-checks';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { sessionApiClient } from '../auth/session-runtime';
import { AppDialog } from '../../ui/app-dialog';
import { theme } from '../../ui/theme';
import { Banner, Button, LoadError, LoadingState, Stack, Text } from '../../ui/primitives';
import { AssistantBoundary, assistantPath, type AssistantHouseholdProps } from './assistant-boundary';
import { assistantToken, useAssistantOperation, useAssistantQuery } from './assistant-runtime';
import { AssistantConversationPanel } from './conversation-panel';
import { AssistantActionsPreview } from './action-preview';
import { AssistantWorkspace } from './assistant-workspace';
import { AssistantModelPicker } from './model-picker';
import { takeFirstMessage } from './first-message';

// The server saves each step of a run, so a short poll shows progress without streaming.
const PROGRESS_POLL_MS = 2_000;

function Conversation({ householdId, householdName, writable, conversationId }: AssistantHouseholdProps & { conversationId: string }) {
  const router = useRouter();
  const inspector = useWindowDimensions().width >= theme.layout.assistantInspectorBreakpoint;
  const trigger = useRef<View>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [draft, setDraft] = useState<{ value: string; revision: number }>();
  /** Shown until the server's copy of the conversation includes the message. */
  const [outgoing, setOutgoing] = useState<{ text: string; baseline: number } | null>(null);
  const load = useCallback(async (token: string) => {
    const [conversation, providers, history] = await Promise.all([
      sessionApiClient.getAssistantConversation(token, householdId, conversationId),
      sessionApiClient.listAssistantProviders(token, householdId),
      sessionApiClient.listAssistantConversations(token, householdId),
    ]);
    return { conversation, providers: providers.providers, history: history.conversations };
  }, [householdId, conversationId]);
  const query = useAssistantQuery(load);
  const operation = useAssistantOperation();
  const conversation = query.data?.conversation;
  const provider = query.data?.providers.find(item => item.id === conversation?.providerId);
  const history = query.data?.history.map(item => item.id === conversation?.id ? { ...item, title: conversation.title, updatedAt: conversation.updatedAt } : item) ?? [];
  const watching = operation.busy || conversation?.state === 'running';
  const { setData } = query;
  useFocusEffect(useCallback(() => {
    if (!watching) return undefined;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const latest = await sessionApiClient.getAssistantConversation(await assistantToken(), householdId, conversationId);
        // A slow poll must not replace a newer copy, such as the final result of the request itself.
        if (!stopped) setData(current => current && Date.parse(latest.updatedAt) >= Date.parse(current.conversation.updatedAt) ? { ...current, conversation: latest } : current);
      } catch {
        // The request in flight, or the next poll, reports the outcome.
      }
      if (!stopped) timer = setTimeout(() => { void poll(); }, PROGRESS_POLL_MS);
    };
    timer = setTimeout(() => { void poll(); }, PROGRESS_POLL_MS);
    return () => { stopped = true; clearTimeout(timer); };
  }, [watching, householdId, conversationId, setData]));
  /** Resolves false unless the server is known to have the message, so the panel can give the text back. */
  const send = async (message: string): Promise<boolean> => {
    if (!conversation || !writable || !provider || conversation.state === 'running') return false;
    const baseline = conversation.messages.length;
    setOutgoing({ text: message, baseline });
    const result = await operation.run(token => sessionApiClient.sendAssistantMessage(token, householdId, conversationId, {
      message, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', expectedVersion: conversation.version,
    }));
    setOutgoing(null);
    if (result) {
      setData(current => current ? { ...current, conversation: result.value } : current);
      return true;
    }
    // A lost HTTP response does not prove the model or write failed. Recover the persisted version.
    const latest = await query.reload();
    return latest !== undefined && latest.conversation.messages.length > baseline;
  };
  // A message typed on the assistant home is sent here, once the new conversation is ready for it.
  const handedOff = useRef(false);
  const ready = Boolean(conversation && provider && writable && conversation.state === 'idle' && conversation.pendingActions.length === 0 && conversation.messages.length === 0);
  useEffect(() => {
    if (!ready || handedOff.current) return;
    handedOff.current = true;
    const first = takeFirstMessage(conversationId);
    if (first) void send(first).then(sent => { if (!sent) setDraft(current => ({ value: first, revision: (current?.revision ?? 0) + 1 })); });
    // `send` reads the current render; `ready` and the ref keep this to a single attempt.
  }, [ready, conversationId]);
  /** Runs the approved proposals; every other pending one is declined. */
  const decide = async (approvedIds: string[]): Promise<boolean> => {
    if (!conversation || !writable || conversation.state === 'running') return false;
    const result = await operation.run(token => sessionApiClient.decideAssistantAction(token, householdId, conversationId, { approvedIds, expectedVersion: conversation.version }));
    if (result) {
      query.setData(current => current ? { ...current, conversation: result.value } : current);
      setPreviewOpen(false);
      return true;
    }
    await query.reload();
    return false;
  };
  const start = async (providerId: string) => {
    if (!writable || operation.busy || conversation?.pendingActions.length || conversation?.state === 'running') return;
    const result = await operation.run(token => sessionApiClient.createAssistantConversation(token, householdId, { providerId }));
    if (result) router.push(`${assistantPath(householdId)}/conversations/${encodeURIComponent(result.value.id)}`);
  };
  const feedback = <Stack gap={3}>
      {query.error ? <LoadError message={query.error} retrying={query.loading} disabled={operation.busy} onRetry={() => { void query.reload(); }} /> : null}
      {operation.error ? <Banner>{operation.error} 已尝试同步对话，请查看最新结果。</Banner> : null}
      {!writable ? <Banner>当前离线，请恢复连接后继续对话。</Banner> : null}
      {query.loading && !query.data ? <LoadingState label="正在加载对话" /> : null}
      {conversation ? <>
        {!provider ? <Banner>这段对话的模型配置已删除或不再共享。历史内容仍可查看，请返回助手首页选择可用模型开始对话。</Banner> : null}
        {conversation.state === 'running' ? <Button label="刷新处理结果" tone="secondary" loading={query.loading} disabled={operation.busy} onPress={() => { void query.reload(); }} /> : null}
      </> : null}
    </Stack>;
  const pending = conversation?.pendingActions ?? [];
  const lone = pending.length === 1 ? pending[0] : undefined;
  const preview = pending.length && conversation ? <AssistantActionsPreview key={`${conversation.id}:${conversation.version}`} householdId={householdId} actions={pending} busy={operation.busy || !writable || conversation.state === 'running'} disabled={!provider || !writable || query.loading || query.error !== null}
    onDecide={approvedIds => { void decide(approvedIds); }} onAdjust={() => { void decide([]).then(success => { if (success) setDraft(current => ({ value: '请调整刚才的建议：', revision: (current?.revision ?? 0) + 1 })); }); }} /> : null;
  const previewLink = pending.length ? <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel="查看待确认操作" accessibilityState={{ disabled: operation.busy }} disabled={operation.busy}
    onPress={() => setPreviewOpen(true)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3], padding: theme.spacing[4], backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface, borderRadius: theme.borderRadii.lg, borderWidth: theme.borderWidths.default, borderColor: theme.colors.separator })}>
    <ListChecks color={theme.colors.inkMuted} size={theme.controlSizes.icon} /><Stack gap={1} style={{ flex: 1 }}><Text variant="label">{lone ? typeof lone.arguments.title === 'string' ? lone.arguments.title : '有一项操作需要你确认' : `有 ${pending.length} 项操作需要你确认`}</Text><Text variant="caption">查看内容 · 确认后才会执行</Text></Stack><ChevronRight color={theme.colors.inkMuted} size={theme.controlSizes.icon} />
  </Pressable> : null;
  return <AssistantWorkspace householdId={householdId} householdName={householdName} title={conversation?.title ?? '家庭助手'} conversationId={conversationId} conversations={history}
    busy={operation.busy} onRefresh={() => { if (!operation.busy) void query.reload(); }}
    {...(conversation && conversation.state !== 'running' && writable ? { onDelete: () => router.push(`${assistantPath(householdId)}/conversations/${encodeURIComponent(conversationId)}/delete`) } : {})}>
    <View style={{ flex: 1, minHeight: 0, flexDirection: 'row' }}>
      {conversation ? <AssistantConversationPanel conversation={conversation} busy={operation.busy} disabled={!writable || !provider || query.loading} onSend={send} feedback={feedback}
        outgoing={outgoing && conversation.messages.length <= outgoing.baseline ? outgoing.text : null}
        onOpenSource={link => router.push(`/households/${encodeURIComponent(householdId)}/${link.section}/${encodeURIComponent(link.id)}`)}
        {...(draft ? { draft } : {})} pendingPreview={inspector ? null : previewLink}
        modelControl={<AssistantModelPicker householdId={householdId} providers={query.data?.providers ?? []} selectedId={conversation.providerId} busy={operation.busy || !writable || pending.length > 0 || conversation.state === 'running'} newConversation onSelect={id => { void start(id); }} />} /> : <ScrollView contentContainerStyle={{ padding: theme.spacing[5] }}>{feedback}</ScrollView>}
      {inspector && preview ? <ScrollView testID="assistant-inspector" style={{ width: theme.layout.assistantInspectorWidth, flexGrow: 0, borderLeftWidth: theme.borderWidths.default, borderLeftColor: theme.colors.separator, backgroundColor: theme.colors.surface }} contentContainerStyle={{ padding: theme.spacing[5] }}>{preview}</ScrollView> : null}
    </View>
    {!inspector && previewOpen && preview ? <AppDialog title="操作预览" size="sheet" trigger={trigger} busy={operation.busy} onClose={() => setPreviewOpen(false)}>{operation.error ? <Banner>{operation.error} 已尝试同步对话，请查看最新结果。</Banner> : null}{preview}</AppDialog> : null}
  </AssistantWorkspace>;
}

export default function AssistantConversationScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  return <AssistantBoundary>{props => <Conversation key={`${props.householdId}:${conversationId}`} {...props} conversationId={conversationId} />}</AssistantBoundary>;
}
