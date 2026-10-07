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
import { AssistantComposer, PromptSuggestions } from './assistant-composer';
import { queueFirstMessage } from './first-message';
import { AssistantModelPicker } from './model-picker';

function AssistantHome({ householdId, householdName, writable }: AssistantHouseholdProps) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
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
  // The conversation exists only once there is something to say; the conversation screen sends this first message.
  const start = async () => {
    const text = message.trim();
    if (!writable || !selected?.hasCredential || query.loading || !text) return;
    const result = await operation.run(token => sessionApiClient.createAssistantConversation(token, householdId, { providerId: selected.id }));
    if (!result) return;
    queueFirstMessage(result.value.id, text);
    setMessage('');
    router.push(`${assistantPath(householdId)}/conversations/${encodeURIComponent(result.value.id)}`);
  };
  return <AssistantWorkspace householdId={householdId} householdName={householdName} title="家庭助手" conversations={query.data?.conversations ?? []} busy={operation.busy} onRefresh={() => { void query.reload(); }}>
    {/* The same left edge as the title row above. */}
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: theme.spacing[5], paddingVertical: theme.spacing[6], gap: theme.spacing[5], maxWidth: theme.layout.assistantReadingWidth, width: '100%', alignSelf: 'center' }}>
      {!writable ? <Banner>当前离线，恢复连接后即可继续使用助手。</Banner> : null}
      {operation.error ? <Banner>{operation.error}</Banner> : null}
      {query.error ? <LoadError message={query.error} onRetry={() => { void query.reload(); }} retrying={query.loading} disabled={operation.busy} /> : null}
      {query.loading && !query.data ? <LoadingState label="正在加载助手" /> : null}
      <Stack gap={5}>
        <Sparkles size={theme.spacing[8]} color={theme.colors.ink} strokeWidth={theme.controlSizes.iconStroke} />
        <Heading variant="display" level={2}>把琐事交给我，{'\n'}把时间留给家人。</Heading>
        <Text color="inkMuted">查安排、记任务、整理笔记。{'\n'}说说你想做什么，我们一起安排好。</Text>
        {query.data ? selected ? <Stack gap={3}>
          <AssistantComposer label="开始新对话" value={message} onChangeText={setMessage} onSend={() => { void start(); }} busy={operation.busy}
            blocked={operation.busy || !writable || query.loading || !selected.hasCredential}
            modelControl={<AssistantModelPicker householdId={householdId} providers={providers} selectedId={selected.id} busy={operation.busy} onSelect={setSelectedId} />} />
          <PromptSuggestions disabled={operation.busy || !writable} onPick={setMessage} />
          <Text variant="caption">内容修改前，由你确认。其他家人看不到你的对话。</Text>
          {/* Whoever runs the endpoint sees what is sent to it; for a shared model that is the configuration owner's choice. */}
          <Text variant="caption">{selected.ownedByMe
            ? `对话及相关家庭数据会发送至 ${selected.baseUrl}。`
            : `这是家人共享的模型：对话及相关家庭数据会发送至配置者填写的 ${selected.baseUrl}，该服务能看到这些内容。`}</Text>
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
