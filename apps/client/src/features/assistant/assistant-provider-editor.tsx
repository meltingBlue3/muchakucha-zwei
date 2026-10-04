import { useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { sessionApiClient } from '../auth/session-runtime';
import { AppShell, HouseholdContextNote } from '../../ui/household-components';
import { Banner, LoadError, LoadingState, Stack, Text } from '../../ui/primitives';
import { RouteWindow } from '../../ui/route-window';
import { AssistantBoundary, assistantPath, type AssistantHouseholdProps } from './assistant-boundary';
import { AssistantProviderForm, type AssistantProviderInput } from './provider-form';
import { useAssistantOperation, useAssistantQuery } from './assistant-runtime';

function ProviderEditor({ householdId, householdName, writable }: AssistantHouseholdProps) {
  const { providerId } = useLocalSearchParams<{ providerId?: string }>();
  const router = useRouter();
  const operation = useAssistantOperation();
  const load = useCallback((token: string) => sessionApiClient.listAssistantProviders(token, householdId), [householdId]);
  const query = useAssistantQuery(load);
  const provider = query.data?.providers.find(item => item.id === providerId);
  const close = () => { if (router.canGoBack()) router.back(); else router.replace(`${assistantPath(householdId)}/providers`); };
  const save = async (input: AssistantProviderInput) => {
    if (!writable) return;
    const result = await operation.run(token => provider
      ? sessionApiClient.updateAssistantProvider(token, householdId, provider.id, { ...input, expectedUpdatedAt: provider.updatedAt })
      : sessionApiClient.createAssistantProvider(token, householdId, { ...input, apiKey: input.apiKey ?? '' }));
    if (result) close();
  };
  return <RouteWindow title={providerId ? '编辑模型配置' : '添加模型配置'} busy={operation.busy} resource="settings" onClose={close} fallback={<AppShell title="助手模型配置"><Text>管理当前家庭的模型配置</Text></AppShell>}>
    <Stack gap={4}>
      <HouseholdContextNote householdName={householdName} />
      {operation.error ? <Banner>{operation.error}</Banner> : null}
      {!writable ? <Banner>当前离线，请恢复连接后编辑模型配置。</Banner> : null}
      {query.error ? <LoadError message={query.error} retrying={query.loading} disabled={operation.busy} onRetry={() => { void query.reload(); }} /> : null}
      {query.loading && !query.data ? <LoadingState label="正在加载模型配置" /> : null}
      {query.data && providerId && !provider ? <Text>这项配置已删除或不再共享。</Text> : null}
      {provider && !provider.ownedByMe ? <Text>只有配置创建者可以编辑。你可以创建自己的配置。</Text> : null}
      {writable && query.data && (!providerId || provider?.ownedByMe) ? <AssistantProviderForm key={provider?.updatedAt ?? 'new'} {...(provider ? { initial: provider } : {})} busy={operation.busy} onCancel={close} onSubmit={save} /> : null}
    </Stack>
  </RouteWindow>;
}

export default function AssistantProviderEditor() {
  const { providerId } = useLocalSearchParams<{ providerId?: string }>();
  return <AssistantBoundary>{props => <ProviderEditor key={`${props.householdId}:${providerId ?? 'new'}`} {...props} />}</AssistantBoundary>;
}
