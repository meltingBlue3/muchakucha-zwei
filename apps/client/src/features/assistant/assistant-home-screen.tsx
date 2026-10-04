import { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import Sparkles from 'lucide-react-native/icons/sparkles';
import { sessionApiClient } from '../auth/session-runtime';
import { Banner, Button, Heading, LoadError, LoadingState, Stack, Text } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import { AssistantBoundary, assistantPath, type AssistantHouseholdProps } from './assistant-boundary';
import { useAssistantOperation, useAssistantQuery } from './assistant-runtime';
import { AssistantWorkspace } from './assistant-workspace';
import { AssistantModelPicker } from './model-picker';

function AssistantHome({ householdId, householdName, writable }: AssistantHouseholdProps) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const load = useCallback(async (token: string) => {
    const [providers, conversations] = await Promise.all([
      sessionApiClient.listAssistantProviders(token, householdId),
      sessionApiClient.listAssistantConversations(token, householdId),
    ]);
    return { providers: providers.providers, conversations: conversations.conversations };
  }, [householdId]);
  const query = useAssistantQuery(load);
  const operation = useAssistantOperation();
  const providers = query.data?.providers ?? [];
  const selected = providers.find(item => item.id === selectedId) ?? providers.find(item => item.hasCredential);
  const start = async () => {
    if (!writable || !selected || query.loading) return;
    const result = await operation.run(token => sessionApiClient.createAssistantConversation(token, householdId, { providerId: selected.id }));
    if (result) router.push(`${assistantPath(householdId)}/conversations/${encodeURIComponent(result.value.id)}`);
  };
  return <AssistantWorkspace householdId={householdId} householdName={householdName} title="家庭助手" conversations={query.data?.conversations ?? []} busy={operation.busy} onRefresh={() => { void query.reload(); }}>
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: theme.spacing[6], gap: theme.spacing[5], maxWidth: theme.layout.assistantReadingWidth, width: '100%', alignSelf: 'center' }}>
      {!writable ? <Banner>当前离线，恢复连接后即可继续使用助手。</Banner> : null}
      {operation.error ? <Banner>{operation.error}</Banner> : null}
      {query.error ? <LoadError message={query.error} onRetry={() => { void query.reload(); }} retrying={query.loading} disabled={operation.busy} /> : null}
      {query.loading && !query.data ? <LoadingState label="正在加载助手" /> : null}
      <Stack gap={5}>
        <Sparkles size={theme.spacing[8]} color={theme.colors.coral} />
        <Heading variant="display" level={2}>把琐事交给我，{'\n'}把时间留给家人。</Heading>
        <Text color="inkMuted">查安排、记任务、整理笔记。{'\n'}说说你想做什么，我们一起安排好。</Text>
        {query.data ? selected ? <Stack gap={3} style={{ alignItems: 'flex-start' }}>
          <AssistantModelPicker householdId={householdId} providers={providers} selectedId={selected.id} busy={operation.busy} onSelect={setSelectedId} />
          <Button label="开始对话" accessibilityLabel={`使用 ${selected.name} 开始对话`} loading={operation.busy} disabled={!writable || query.loading || !selected.hasCredential} onPress={() => { void start(); }} />
          <Text variant="caption">内容修改前，由你确认。对话仅自己可见。</Text>
          <Text variant="caption">对话及相关家庭数据会发送至 {selected.baseUrl}。</Text>
        </Stack> : <Stack gap={3}>
          <Text variant="bodySm">先添加自己的模型，或请家人共享一个配置。</Text>
          <Button label="添加模型配置" disabled={!writable} onPress={() => router.push(`${assistantPath(householdId)}/providers/new`)} style={{ alignSelf: 'flex-start' }} />
        </Stack> : null}
      </Stack>
    </ScrollView>
  </AssistantWorkspace>;
}

export default function AssistantHomeScreen() {
  return <AssistantBoundary>{props => <AssistantHome key={props.householdId} {...props} />}</AssistantBoundary>;
}
