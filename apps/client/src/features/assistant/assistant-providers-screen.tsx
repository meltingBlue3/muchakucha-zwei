import { i18n, useTranslation } from '../../i18n';
import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import Settings from 'lucide-react-native/icons/settings';
import type { AssistantProviderUsageDto } from '@muchakucha/api-client';
import { sessionApiClient } from '../auth/session-runtime';
import { HouseholdScreen } from '../households/household-screen';
import { CardActionsMenu } from '../../ui/card-actions-menu';
import { PageIntro } from '../../ui/page-intro';
import { Button, EmptyState, LoadError, LoadingState, Stack, Text } from '../../ui/primitives';
import { SettingsSection } from '../../ui/settings-section';
import { theme } from '../../ui/theme';
import { AssistantBoundary, assistantPath, type AssistantHouseholdProps } from './assistant-boundary';
import { isTranscriptionProvider, useAssistantQuery } from './assistant-runtime';

/** Token counts in the units people read: 8500 or 3.2 万. */
export function formatTokens(count: number): string {
  return count >= 10_000 ? i18n.t('assistant:models.tenThousand', { count: (count / 10_000).toFixed(1).replace(/\.0$/, '') }) : String(count);
}

/** What a configuration cost its owner this month, by member. */
export function UsageSummary({ usage }: { usage: AssistantProviderUsageDto }) {
  const { t } = useTranslation('assistant');
  if (!usage.requests) return <Text variant="caption">{t('models.unused')}</Text>;
  return <Stack gap={1}>
    <Text variant="caption">{t('models.monthly', { requests: usage.requests, input: formatTokens(usage.inputTokens), output: formatTokens(usage.outputTokens) })}</Text>
    {usage.members.map(member => <Text key={member.userId} variant="caption" color="inkMuted">
      {t('models.memberUsage', { name: member.displayName, requests: member.requests, tokens: formatTokens(member.inputTokens + member.outputTokens) })}
    </Text>)}
  </Stack>;
}

function AssistantProviders({ householdId, householdName, writable }: AssistantHouseholdProps) {
  const router = useRouter();
  const { t } = useTranslation('assistant');
  const root = assistantPath(householdId);
  const load = useCallback((token: string) => sessionApiClient.listAssistantProviders(token, householdId), [householdId]);
  const query = useAssistantQuery(load);
  // A subpage of 助手: a phone gets a back button and PageIntro carries the
  // title; a wide screen keeps the sidebar with 助手 selected.
  return <HouseholdScreen active="assistant" subpage width="reading" accessibilityLabel={t('models.screen')} refreshing={query.loading && query.data !== null} onRefresh={() => { void query.reload(); }}>
    <Stack gap={4}>
      <PageIntro title={t('models.title')} action={<Button label={t('models.addShort')} accessibilityLabel={t('models.add')} disabled={!writable} onPress={() => router.push(`${root}/providers/new`)} />} />
      <Text variant="bodySm" color="inkMuted">{t('models.managedByCreator', { name: householdName })}</Text>
      <Text variant="bodySm">{t('models.sharedInfo')}</Text>
      {query.error ? <LoadError message={query.error} retrying={query.loading} onRetry={() => { void query.reload(); }} /> : null}
      <Text variant="bodySm" color="inkMuted">{t('models.voiceInfo')}</Text>
      {query.loading && query.data === null ? <LoadingState label={t('models.loading')} /> : null}
      {query.data?.providers.length === 0 ? <EmptyState message={t('models.empty')} /> : null}
      {query.data?.providers.map(provider => <SettingsSection key={provider.id} title={provider.name} icon={<Settings color={theme.colors.inkMuted} size={theme.controlSizes.icon} />} detail={provider.ownedByMe ? t('models.owned') : t('models.shared')}
        action={provider.ownedByMe ? <CardActionsMenu subject={t('models.subject', { name: provider.name })} disabled={!writable} actions={[
          { kind: 'edit', accessibilityLabel: t('models.editName', { name: provider.name }), onPress: () => router.push(`${root}/providers/${encodeURIComponent(provider.id)}/edit`) },
          { kind: 'delete', accessibilityLabel: t('models.deleteName', { name: provider.name }), onPress: () => router.push(`${root}/providers/${encodeURIComponent(provider.id)}/delete`) },
        ]} /> : null}>
        <Stack gap={1}>
          <Text>{isTranscriptionProvider(provider) ? t('models.transcription') : t('models.chat')} · {provider.model}</Text>
          <Text variant="bodySm" color="inkMuted">{provider.baseUrl}</Text>
          <Text variant="bodySm">{provider.visibility === 'private' ? t('models.private') : t('models.household')} · {provider.hasCredential ? t('models.hasKey') : provider.ownedByMe ? t('models.missingOwnKey') : t('models.missingSharedKey')}</Text>
        </Stack>
        {provider.usage ? <UsageSummary usage={provider.usage} /> : null}
        {provider.ownedByMe ? null : <Text variant="caption">{t('models.contactOwner')}</Text>}
      </SettingsSection>)}
    </Stack>
  </HouseholdScreen>;
}

export default function AssistantProvidersScreen() {
  return <AssistantBoundary>{props => <AssistantProviders key={props.householdId} {...props} />}</AssistantBoundary>;
}
