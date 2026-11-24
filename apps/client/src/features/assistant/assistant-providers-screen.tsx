import { i18n, useTranslation } from '../../i18n';
import { useCallback } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import Settings from 'lucide-react-native/icons/settings';
import type { AssistantProviderResponseDto, AssistantProviderUsageDto } from '@muchakucha/api-client';
import { sessionApiClient } from '../auth/session-runtime';
import { HouseholdScreen } from '../households/household-screen';
import { CardActionsMenu } from '../../ui/card-actions-menu';
import { rememberRouteTrigger, routeFocusFallback } from '../../platform/overlays/route-trigger';
import { PageIntro } from '../../ui/page-intro';
import { Button, EmptyState, LoadError, LoadingState, Stack, Text } from '../../ui/primitives';
import { RouteWindow } from '../../ui/route-window';
import { SettingsRows, SettingsSection } from '../../ui/settings-section';
import { theme } from '../../ui/theme';
import { useDesktop } from '../../ui/use-desktop';
import { AssistantBoundary, assistantPath, type AssistantHouseholdProps } from './assistant-boundary';
import AssistantHomeScreen from './assistant-home-screen';
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

/** One configuration: what it is, who may use it, and what it cost this month. */
function ProviderSection({ provider, root, writable, plain }: { provider: AssistantProviderResponseDto; root: string; writable: boolean; plain: boolean }) {
  const router = useRouter();
  const { t } = useTranslation('assistant');
  return <SettingsSection plain={plain} title={provider.name} icon={<Settings color={theme.colors.inkMuted} size={theme.controlSizes.icon} />} detail={provider.ownedByMe ? t('models.owned') : t('models.shared')}
    action={provider.ownedByMe ? <CardActionsMenu subject={t('models.subject', { name: provider.name })} disabled={!writable} actions={[
      { kind: 'edit', accessibilityLabel: t('models.editName', { name: provider.name }), onPress: () => { rememberRouteTrigger(); router.push(`${root}/providers/${encodeURIComponent(provider.id)}/edit`); } },
      { kind: 'delete', accessibilityLabel: t('models.deleteName', { name: provider.name }), onPress: () => { rememberRouteTrigger(); router.push(`${root}/providers/${encodeURIComponent(provider.id)}/delete`); } },
    ]} /> : null}>
    <Stack gap={1}>
      <Text variant={plain ? 'bodySm' : 'body'} color="ink">{isTranscriptionProvider(provider) ? t('models.transcription') : t('models.chat')} · {provider.model}</Text>
      <Text variant={plain ? 'meta' : 'bodySm'} color="inkMuted">{provider.baseUrl}</Text>
      <Text variant={plain ? 'meta' : 'bodySm'}>{provider.visibility === 'private' ? t('models.private') : t('models.household')} · {provider.hasCredential ? t('models.hasKey') : provider.ownedByMe ? t('models.missingOwnKey') : t('models.missingSharedKey')}</Text>
    </Stack>
    {provider.usage ? <UsageSummary usage={provider.usage} /> : null}
    {provider.ownedByMe ? null : <Text variant="caption">{t('models.contactOwner')}</Text>}
  </SettingsSection>;
}

function AssistantProviders({ householdId, householdName, writable }: AssistantHouseholdProps) {
  const router = useRouter();
  const { t } = useTranslation('assistant');
  const desktop = useDesktop();
  const root = assistantPath(householdId);
  const load = useCallback((token: string) => sessionApiClient.listAssistantProviders(token, householdId), [householdId]);
  const query = useAssistantQuery(load);
  const add = () => { rememberRouteTrigger(); router.push(`${root}/providers/new`); };
  const notes = <>
    <Text variant="bodySm" color="inkMuted">{t('models.managedByCreator', { name: householdName })}</Text>
    <Text variant="bodySm">{t('models.sharedInfo')}</Text>
    {query.error ? <LoadError message={query.error} retrying={query.loading} onRetry={() => { void query.reload(); }} /> : null}
    <Text variant="bodySm" color="inkMuted">{t('models.voiceInfo')}</Text>
    {query.loading && query.data === null ? <LoadingState label={t('models.loading')} /> : null}
    {query.data?.providers.length === 0 ? <EmptyState message={t('models.empty')} /> : null}
  </>;
  // Desktop: a window above the assistant, which stays where it was. The
  // configurations read as one list with hairlines, not cards inside a card.
  if (desktop) {
    const close = () => { if (router.canGoBack()) router.back(); else router.replace(root); };
    return <RouteWindow title={t('models.title')} resource="settings" onClose={close} fallback={<AssistantHomeScreen />}
      headerActions={<Button {...routeFocusFallback} label={t('models.addShort')} accessibilityLabel={t('models.add')} size="compact" disabled={!writable} onPress={add} />}>
      <Stack gap={4}>
        {notes}
        {query.data?.providers.length ? <View style={{ borderTopWidth: theme.borderWidths.default, borderTopColor: theme.colors.separator }}>
          <SettingsRows>
            {query.data.providers.map((provider, index) => <View key={provider.id} style={{ paddingTop: theme.spacing[4], paddingBottom: index < query.data!.providers.length - 1 ? theme.spacing[4] : 0 }}>
              <ProviderSection provider={provider} root={root} writable={writable} plain />
            </View>)}
          </SettingsRows>
        </View> : null}
      </Stack>
    </RouteWindow>;
  }
  // A subpage of 助手: a phone gets a back button and PageIntro carries the title.
  return <HouseholdScreen active="assistant" subpage width="reading" accessibilityLabel={t('models.screen')} refreshing={query.loading && query.data !== null} onRefresh={() => { void query.reload(); }}>
    <Stack gap={4}>
      <PageIntro title={t('models.title')} action={<Button {...routeFocusFallback} label={t('models.addShort')} accessibilityLabel={t('models.add')} disabled={!writable} onPress={add} />} />
      {notes}
      {query.data?.providers.map(provider => <ProviderSection key={provider.id} provider={provider} root={root} writable={writable} plain={false} />)}
    </Stack>
  </HouseholdScreen>;
}

export default function AssistantProvidersScreen() {
  return <AssistantBoundary>{props => <AssistantProviders key={props.householdId} {...props} />}</AssistantBoundary>;
}
