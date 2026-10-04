import { useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { sessionApiClient } from '../auth/session-runtime';
import { AppShell } from '../../ui/household-components';
import { PageIntro } from '../../ui/page-intro';
import { Banner, Button, LoadError, LoadingState, Stack, Text } from '../../ui/primitives';
import { AssistantBoundary, assistantPath, type AssistantHouseholdProps } from './assistant-boundary';
import { useAssistantOperation, useAssistantQuery } from './assistant-runtime';
import { AssistantConversationPanel } from './conversation-panel';
import { AssistantActionPreview } from './action-preview';

function Conversation({ householdId, householdName, writable, conversationId }: AssistantHouseholdProps & { conversationId: string }) {
  const router = useRouter();
  const load = useCallback(async (token: string) => {
    const [conversation, providers] = await Promise.all([
      sessionApiClient.getAssistantConversation(token, householdId, conversationId),
      sessionApiClient.listAssistantProviders(token, householdId),
    ]);
    return { conversation, providers: providers.providers };
  }, [householdId, conversationId]);
  const query = useAssistantQuery(load);
  const operation = useAssistantOperation();
  const conversation = query.data?.conversation;
  const provider = query.data?.providers.find(item => item.id === conversation?.providerId);
  const send = async (message: string): Promise<boolean> => {
    if (!conversation || !writable || !provider || conversation.state === 'running') return false;
    const result = await operation.run(token => sessionApiClient.sendAssistantMessage(token, householdId, conversationId, {
      message, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', expectedVersion: conversation.version,
    }));
    if (result) {
      query.setData(current => current ? { ...current, conversation: result.value } : current);
      return true;
    }
    // A lost HTTP response does not prove the model or write failed. Recover the persisted version.
    await query.reload();
    return false;
  };
  const decide = async (approve: boolean) => {
    if (!conversation || !writable || conversation.state === 'running') return;
    const result = await operation.run(token => sessionApiClient.decideAssistantAction(token, householdId, conversationId, { approve, expectedVersion: conversation.version }));
    if (result) query.setData(current => current ? { ...current, conversation: result.value } : current);
    else await query.reload();
  };
  return <AppShell title="助手对话" showBack accessibilityLabel="助手对话" refreshing={query.loading && query.data !== null} onRefresh={() => { if (!operation.busy) void query.reload(); }}>
    <Stack gap={4}>
      <PageIntro title="助手" action={conversation ? <Button label="删除对话" tone="secondary" disabled={operation.busy || conversation.state === 'running' || !writable} onPress={() => router.push(`${assistantPath(householdId)}/conversations/${encodeURIComponent(conversationId)}/delete`)} /> : null} />
      <Text variant="bodySm" color="inkMuted">{householdName} · {provider?.name ?? '模型配置不可用'} · 对话仅自己可见</Text>
      {provider ? <Text variant="caption">本次对话和查询到的家庭数据将发送至 {provider.baseUrl}。{provider.ownedByMe ? '' : '使用家人共享的模型额度。'}</Text> : null}
      {query.error ? <LoadError message={query.error} retrying={query.loading} disabled={operation.busy} onRetry={() => { void query.reload(); }} /> : null}
      {operation.error ? <Banner>{operation.error} 已尝试同步对话，请查看最新结果。</Banner> : null}
      {!writable ? <Banner>当前离线，请恢复连接后继续对话。</Banner> : null}
      {query.loading && !query.data ? <LoadingState label="正在加载对话" /> : null}
      {conversation ? <>
        {!provider ? <Banner>这段对话的模型配置已删除或不再共享。历史内容仍可查看，请返回助手首页选择可用模型开始对话。</Banner> : null}
        {conversation.state === 'running' ? <Button label="刷新处理结果" tone="secondary" loading={query.loading} disabled={operation.busy} onPress={() => { void query.reload(); }} /> : null}
        {conversation.pendingAction ? <AssistantActionPreview key={`${conversation.id}:${conversation.version}`} householdId={householdId} action={conversation.pendingAction} busy={operation.busy || !writable || conversation.state === 'running'} disabled={!provider || !writable || query.loading || query.error !== null} onDecide={approve => { void decide(approve); }} /> : null}
        <AssistantConversationPanel conversation={conversation} busy={operation.busy} disabled={!writable || !provider || query.loading} onSend={send} />
      </> : null}
    </Stack>
  </AppShell>;
}

export default function AssistantConversationScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  return <AssistantBoundary>{props => <Conversation key={`${props.householdId}:${conversationId}`} {...props} conversationId={conversationId} />}</AssistantBoundary>;
}
