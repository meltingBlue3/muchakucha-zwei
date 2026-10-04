import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { sessionApiClient } from '../auth/session-runtime';
import { AppShell } from '../../ui/household-components';
import { PageIntro } from '../../ui/page-intro';
import { Banner, Button, EmptyState, Heading, LoadError, LoadingState, Stack, Text } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import { formatDateTime } from '../../ui/date-values';
import { AssistantBoundary, assistantPath, type AssistantHouseholdProps } from './assistant-boundary';
import { useAssistantOperation, useAssistantQuery } from './assistant-runtime';

function AssistantHome({ householdId, householdName, writable }: AssistantHouseholdProps) {
  const router = useRouter();
  const root = assistantPath(householdId);
  const load = useCallback(async (token: string) => {
    const [providers, conversations] = await Promise.all([
      sessionApiClient.listAssistantProviders(token, householdId),
      sessionApiClient.listAssistantConversations(token, householdId),
    ]);
    return { providers: providers.providers, conversations: conversations.conversations };
  }, [householdId]);
  const query = useAssistantQuery(load);
  const operation = useAssistantOperation();
  const start = async (providerId: string) => {
    if (!writable) return;
    const result = await operation.run(token => sessionApiClient.createAssistantConversation(token, householdId, { providerId }));
    if (result) router.push(`${root}/conversations/${encodeURIComponent(result.value.id)}`);
  };
  return <AppShell title="助手" showBack accessibilityLabel="家庭助手" refreshing={query.loading && query.data !== null} onRefresh={() => { if (!operation.busy) void query.reload(); }}>
    <Stack gap={5}>
      <PageIntro title="助手" action={<Button label="模型配置" tone="secondary" disabled={operation.busy} onPress={() => router.push(`${root}/providers`)} />} />
      <Text variant="bodySm" color="inkMuted">{householdName} · 对话仅自己可见</Text>
      <Text>用自然语言整理日程、任务和笔记，或结合家庭中的内容寻找答案。</Text>
      <Text variant="bodySm" color="inkMuted">助手会将对话及为回答问题查询到的家庭数据发送给你选择的模型服务。创建、编辑和删除内容都需要你确认。</Text>
      {!writable ? <Banner>当前离线，恢复连接后即可继续使用助手。</Banner> : null}
      {operation.error ? <Banner>{operation.error}</Banner> : null}
      {query.error ? <LoadError message={query.error} onRetry={() => { void query.reload(); }} retrying={query.loading} disabled={operation.busy} /> : null}
      {query.loading && query.data === null ? <LoadingState label="正在加载助手" /> : null}
      {query.data ? <>
        <Stack gap={3}>
          <Heading variant="section">开始对话</Heading>
          {query.data.providers.length === 0 ? <EmptyState message="还没有可用的模型配置。添加自己的模型，或请家人共享配置。" action={<Button label="添加模型配置" onPress={() => router.push(`${root}/providers/new`)} disabled={!writable} />} /> : query.data.providers.map(provider => <Stack key={provider.id} gap={3} style={{ padding: theme.spacing[4], borderRadius: theme.borderRadii.xl, backgroundColor: theme.colors.surface }}>
            <Text variant="label">{provider.name}</Text>
            <Text variant="bodySm" color="inkMuted">{provider.model} · {provider.ownedByMe ? provider.visibility === 'private' ? '仅自己' : '你共享给家庭' : '家人共享'}</Text>
            <Button label={`使用 ${provider.name}`} accessibilityLabel={`使用 ${provider.name} 开始对话`} tone="secondary" loading={operation.busy} disabled={!writable || !provider.hasCredential} onPress={() => { void start(provider.id); }} />
          </Stack>)}
        </Stack>
        <Stack gap={3}>
          <Heading variant="section">我的对话</Heading>
          {query.data.conversations.length === 0 ? <EmptyState message="开始第一段对话，例如“这周有哪些安排，需要提前准备什么？”" /> : query.data.conversations.map(conversation => <Stack key={conversation.id} gap={1} style={{ padding: theme.spacing[4], borderRadius: theme.borderRadii.xl, backgroundColor: theme.colors.surface }}>
            <Button label={conversation.title} accessibilityLabel={`打开对话：${conversation.title}`} tone="secondary" disabled={operation.busy} onPress={() => router.push(`${root}/conversations/${encodeURIComponent(conversation.id)}`)} />
            <Text variant="caption">{formatDateTime(new Date(conversation.updatedAt))}</Text>
          </Stack>)}
        </Stack>
      </> : null}
    </Stack>
  </AppShell>;
}

export default function AssistantHomeScreen() {
  return <AssistantBoundary>{props => <AssistantHome key={props.householdId} {...props} />}</AssistantBoundary>;
}
