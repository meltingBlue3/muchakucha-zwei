import { useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { sessionApiClient } from '../auth/session-runtime';
import { AppShell } from '../../ui/household-components';
import { Banner, ConfirmActions, LoadError, LoadingState, Stack, Text } from '../../ui/primitives';
import { RouteWindow } from '../../ui/route-window';
import { AssistantBoundary, assistantPath, type AssistantHouseholdProps } from './assistant-boundary';
import { useAssistantOperation, useAssistantQuery } from './assistant-runtime';

function DeleteAssistantItem({ householdId, writable, kind }: AssistantHouseholdProps & { kind: 'provider' | 'conversation' }) {
  const { providerId, conversationId } = useLocalSearchParams<{ providerId?: string; conversationId?: string }>();
  const router = useRouter();
  const operation = useAssistantOperation();
  const targetId = (kind === 'provider' ? providerId : conversationId) ?? '';
  const destination = kind === 'provider' ? `${assistantPath(householdId)}/providers` as const : assistantPath(householdId);
  const close = () => { if (router.canGoBack()) router.back(); else router.replace(destination); };
  const load = useCallback(async (token: string) => {
    if (kind === 'provider') {
      const providers = await sessionApiClient.listAssistantProviders(token, householdId);
      const item = providers.providers.find(provider => provider.id === targetId);
      return item ? { title: item.name, allowed: item.ownedByMe, shared: item.visibility === 'household', running: false } : null;
    }
    const conversation = await sessionApiClient.getAssistantConversation(token, householdId, targetId);
    return { title: conversation.title, allowed: true, shared: false, running: conversation.state === 'running' };
  }, [kind, householdId, targetId]);
  const query = useAssistantQuery(load);
  const remove = async () => {
    if (!writable || !query.data?.allowed || query.data.running) return;
    const result = await operation.run(token => kind === 'provider'
      ? sessionApiClient.deleteAssistantProvider(token, householdId, targetId)
      : sessionApiClient.deleteAssistantConversation(token, householdId, targetId));
    if (result) router.replace(destination);
  };
  const title = kind === 'provider' ? '删除模型配置' : '删除对话';
  return <RouteWindow title={title} size="standard" busy={operation.busy} resource="settings" onClose={close} fallback={<AppShell title="助手"><Text>管理当前家庭的助手内容</Text></AppShell>}>
    <Stack gap={4}>
      {operation.error ? <Banner>{operation.error}</Banner> : null}
      {query.error ? <LoadError message={query.error} retrying={query.loading} disabled={operation.busy} onRetry={() => { void query.reload(); }} /> : null}
      {query.loading && !query.data ? <LoadingState label="正在加载删除内容" /> : null}
      {query.data ? <>
        <Text>确定删除「{query.data.title}」？</Text>
        <Text variant="bodySm">{kind === 'provider' ? `${query.data.shared ? '所有家人将无法继续使用此配置。' : ''}密钥会一并删除；原有对话可继续查看，但无法再调用此模型。` : '这段对话将永久删除，已经完成的日程、任务和笔记操作不会撤销。'}</Text>
        {!query.data.allowed ? <Banner>只有配置创建者可以删除。</Banner> : null}
        {query.data.running ? <Banner>助手仍在处理，请稍后刷新再删除。</Banner> : null}
        {!writable ? <Banner>请恢复连接后再删除。</Banner> : null}
        <ConfirmActions cancelLabel="保留" confirmLabel="删除" destructive busy={operation.busy} confirmDisabled={!writable || !query.data.allowed || query.data.running || query.loading} onCancel={close} onConfirm={() => { void remove(); }} />
      </> : !query.loading && !query.error ? <Text>这项内容已删除或不再可用。</Text> : null}
    </Stack>
  </RouteWindow>;
}

export function AssistantProviderDeleteScreen() {
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  return <AssistantBoundary>{props => <DeleteAssistantItem key={`${props.householdId}:${providerId}`} {...props} kind="provider" />}</AssistantBoundary>;
}

export function AssistantConversationDeleteScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  return <AssistantBoundary>{props => <DeleteAssistantItem key={`${props.householdId}:${conversationId}`} {...props} kind="conversation" />}</AssistantBoundary>;
}
