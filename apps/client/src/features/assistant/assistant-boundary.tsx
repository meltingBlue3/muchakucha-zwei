import { useTranslation } from '../../i18n';
import type { ReactNode } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useHouseholdContext } from '../households/household-context';
import { AccessChangedPanel, AppShell } from '../../ui/household-components';
import { Button, EmptyState, LoadingState } from '../../ui/primitives';

export interface AssistantHouseholdProps { householdId: string; householdName: string; writable: boolean }

/** Unmount all private assistant state during household transitions or access loss. */
export function AssistantBoundary({ children }: { children: (props: AssistantHouseholdProps) => ReactNode }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation('assistant');
  const router = useRouter();
  const context = useHouseholdContext();
  const household = context.households.find(item => item.id === id);
  if (context.viewState === 'accessChanged') return <AppShell accessibilityLabel={t('accessChanged')}><AccessChangedPanel
    hasOtherHouseholds={context.households.length > 0}
    {...(context.accessChangedHouseholdName === undefined ? {} : { householdName: context.accessChangedHouseholdName })}
    onChooseOther={() => { void context.refreshHouseholds().then(() => router.replace('/households')); }}
    onCreateNew={() => router.replace('/household-handoff')}
  /></AppShell>;
  if (context.viewState === 'resolving') return <AppShell accessibilityLabel={t('loadingHousehold')}><LoadingState label={t('loadingHousehold')} /></AppShell>;
  if (!household || context.viewState === 'noHousehold') return <AppShell title={t('assistant')} showBack accessibilityLabel={t('unavailable')}><EmptyState
    message={t('chooseJoined')}
    action={<Button label={t('chooseHousehold')} onPress={() => router.replace('/households')} />}
  /></AppShell>;
  return children({ householdId: household.id, householdName: household.name, writable: context.viewState === 'ready' });
}

export function assistantPath(householdId: string): `/households/${string}/assistant` {
  return `/households/${encodeURIComponent(householdId)}/assistant`;
}
