import { currentLanguage, useTranslation } from '../../i18n';
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
  const { t } = useTranslation('assistant');
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
    const conversation = await sessionApiClient.getAssistantConversation(token, householdId, targetId, undefined, currentLanguage());
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
  const title = kind === 'provider' ? t('delete.deleteModel') : t('delete.deleteConversation');
  return <RouteWindow title={title} size="standard" busy={operation.busy} resource="settings" onClose={close} fallback={<AppShell title={t('assistant')}><Text>{t('delete.manage')}</Text></AppShell>}>
    <Stack gap={4}>
      {operation.error ? <Banner>{operation.error}</Banner> : null}
      {query.error ? <LoadError message={query.error} retrying={query.loading} disabled={operation.busy} onRetry={() => { void query.reload(); }} /> : null}
      {query.loading && !query.data ? <LoadingState label={t('delete.loading')} /> : null}
      {query.data ? <>
        <Text>{t('delete.confirm', { title: query.data.title ?? t('workspace.newConversation') })}</Text>
        <Text variant="bodySm">{kind === 'provider' ? `${query.data.shared ? t('delete.shared') : ''}${t('delete.modelWarning')}` : t('delete.conversationWarning')}</Text>
        {!query.data.allowed ? <Banner>{t('delete.creatorOnly')}</Banner> : null}
        {query.data.running ? <Banner>{t('delete.running')}</Banner> : null}
        {!writable ? <Banner>{t('delete.offline')}</Banner> : null}
        <ConfirmActions cancelLabel={t('delete.keep')} confirmLabel={t('delete.confirmDelete')} destructive busy={operation.busy} confirmDisabled={!writable || !query.data.allowed || query.data.running || query.loading} onCancel={close} onConfirm={() => { void remove(); }} />
      </> : !query.loading && !query.error ? <Text>{t('delete.unavailable')}</Text> : null}
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
