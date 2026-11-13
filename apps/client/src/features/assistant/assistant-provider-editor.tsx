import { useTranslation } from '../../i18n';
import { useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { sessionApiClient } from '../auth/session-runtime';
import { AppShell, HouseholdContextNote } from '../../ui/household-components';
import { Banner, LoadError, LoadingState, Stack, Text } from '../../ui/primitives';
import { RouteWindow } from '../../ui/route-window';
import { AssistantBoundary, assistantPath, type AssistantHouseholdProps } from './assistant-boundary';
import { AssistantProviderForm, type AssistantProviderInput } from './provider-form';
import { assistantToken, useAssistantOperation, useAssistantQuery } from './assistant-runtime';

function ProviderEditor({ householdId, householdName, writable }: AssistantHouseholdProps) {
  const { providerId } = useLocalSearchParams<{ providerId?: string }>();
  const router = useRouter();
  const { t } = useTranslation('assistant');
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
  // Without a newly typed key, the server checks with the key saved for this configuration.
  const check = async (input: AssistantProviderInput) => sessionApiClient.checkAssistantProvider(await assistantToken(), householdId, {
    protocol: input.protocol, baseUrl: input.baseUrl, model: input.model,
    ...(input.apiKey ? { apiKey: input.apiKey } : provider ? { providerId: provider.id } : {}),
  });
  return <RouteWindow title={providerId ? t('models.edit') : t('models.add')} busy={operation.busy} resource="settings" onClose={close} fallback={<AppShell title={t('models.screen')}><Text>{t('models.editorFallback')}</Text></AppShell>}>
    <Stack gap={4}>
      <HouseholdContextNote householdName={householdName} />
      {operation.error ? <Banner>{operation.error}</Banner> : null}
      {!writable ? <Banner>{t('models.offline')}</Banner> : null}
      {query.error ? <LoadError message={query.error} retrying={query.loading} disabled={operation.busy} onRetry={() => { void query.reload(); }} /> : null}
      {query.loading && !query.data ? <LoadingState label={t('models.loading')} /> : null}
      {query.data && providerId && !provider ? <Text>{t('models.unavailable')}</Text> : null}
      {provider && !provider.ownedByMe ? <Text>{t('models.creatorOnly')}</Text> : null}
      {writable && query.data && (!providerId || provider?.ownedByMe) ? <AssistantProviderForm key={provider?.updatedAt ?? 'new'} {...(provider ? { initial: provider } : {})} busy={operation.busy} onCancel={close} onSubmit={save} onCheck={check} /> : null}
    </Stack>
  </RouteWindow>;
}

export default function AssistantProviderEditor() {
  const { providerId } = useLocalSearchParams<{ providerId?: string }>();
  return <AssistantBoundary>{props => <ProviderEditor key={`${props.householdId}:${providerId ?? 'new'}`} {...props} />}</AssistantBoundary>;
}
