import { useTranslation } from '../../../src/i18n';
import { HouseholdSetup } from '../../../src/ui/account-components';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { useHouseholdContext } from '../../../src/features/households/household-context';
import {
  AccessChangedPanel,
  AppShell,
  HouseholdCard,
  HouseholdHeader,
  HouseholdSwitcher,
  SwitchErrorBanner,
} from '../../../src/ui/household-components';
import { Button, LoadError, Spinner, Stack, Text } from '../../../src/ui/primitives';
import { theme } from '../../../src/ui/theme';

export default function HouseholdsIndexRoute() {
  const { t } = useTranslation(['households', 'profile', 'auth']);
  const router = useRouter();
  const {
    viewState,
    households,
    currentHouseholdId,
    accessChangedHouseholdName,
    switchHousehold,
    refreshHouseholds,
  } = useHouseholdContext();

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switchError, setSwitchError] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  const currentHousehold = households.find((h) => h.id === currentHouseholdId) ?? null;

  // When user already has a current household, jump straight to its detail
  // page — the list view is a transient entry point, not a destination.
  useEffect(() => {
    if (viewState === 'ready' && currentHouseholdId !== null) {
      void router.replace(`/households/${encodeURIComponent(currentHouseholdId)}`);
    }
  }, [viewState, currentHouseholdId, router]);

  const handleSwitch = useCallback(async (householdId: string) => {
    if (householdId === currentHouseholdId) {
      setSwitcherOpen(false);
      return;
    }
    setIsSwitching(true);
    setSwitchError(false);
    const success = await switchHousehold(householdId);
    if (!success) {
      setSwitchError(true);
    }
    setIsSwitching(false);
    setSwitcherOpen(false);
  }, [currentHouseholdId, switchHousehold]);

  const handleRetrySwitch = useCallback(async () => {
    setIsSwitching(true);
    setSwitchError(false);
    const success = await refreshHouseholds();
    if (!success) {
      setSwitchError(true);
    }
    setIsSwitching(false);
  }, [refreshHouseholds]);

  // ---- AccessChanged state ----
  if (viewState === 'accessChanged') {
    const hasOtherHouseholds = households.length > 0;
    return (
      <AppShell accessibilityLabel={t('accessChanged')}>
        <AccessChangedPanel
          hasOtherHouseholds={hasOtherHouseholds}
          {...(accessChangedHouseholdName === undefined ? {} : { householdName: accessChangedHouseholdName })}
          onChooseOther={() => {
            void refreshHouseholds();
          }}
          onCreateNew={() => {
            // Navigate to the create/accept handoff.
            void router.replace('/household-handoff');
          }}
        />
      </AppShell>
    );
  }

  // ---- Resolving state ----
  if (viewState === 'resolving') {
    return (
      <AppShell accessibilityLabel={t('loading')}>
        <Stack accessibilityLabel={t('loadingList')} gap={6} style={{ alignItems: 'center', paddingTop: 48 }}>
          <Spinner label={t('loading')} />
          <Text variant="bodySm">{t('loadingList')}</Text>
        </Stack>
      </AppShell>
    );
  }

  // ---- Offline retained or ready with no households ----
  if (viewState === 'noHousehold') {
    return (
      <AppShell accessibilityLabel={t('noHousehold')} title={t('setupAction')} showProfile>
        <Stack style={{ width: '100%', maxWidth: theme.layout.authCardMaxWidth, alignSelf: 'center' }}>
          <HouseholdSetup onCreate={() => router.push('/households/new')} onJoin={() => router.push('/inbox')} />
        </Stack>
      </AppShell>
    );
  }

  // ---- Ready (with households) ----
  return (
    <AppShell accessibilityLabel={t('chooseTitle')} title={t('profile:links.households.label')} showProfile>
      <Stack gap={6}>
        {currentHousehold !== null ? (
          <HouseholdHeader
            householdName={currentHousehold.name}
            onOpenSwitcher={() => setSwitcherOpen(true)}
          />
        ) : null}

        {viewState === 'offlineRetained' ? (
          <LoadError title={t('auth:offline.title')} message={t('offlineList')} retryLabel={t('reload')} retrying={isSwitching} onRetry={() => void handleRetrySwitch()} />
        ) : null}

        {switchError && currentHousehold !== null ? (
          <SwitchErrorBanner
            householdName={currentHousehold.name}
            onRetry={() => void handleRetrySwitch()}
          />
        ) : null}

        {isSwitching ? (
          <Stack gap={4} style={{ alignItems: 'center', paddingVertical: theme.spacing[8] }}>
            <Spinner label={t('switching')} />
            <Text variant="bodySm">{t('switching')}</Text>
          </Stack>
        ) : (
          <Stack gap={4}>
            <Text variant="bodySm">
              {currentHousehold !== null
                ? t('lastSelected')
                : t('choose')}
            </Text>

            {households.map((household) => (
              <HouseholdCard
                household={household}
                isCurrent={household.id === currentHouseholdId}
                key={household.id}
                onSelect={(id) => { void handleSwitch(id); }}
              />
            ))}

            <Button
              label={t('create')}
              onPress={() => void router.push('/households/new')}
            />
          </Stack>
        )}
      </Stack>

      <HouseholdSwitcher
        currentHouseholdId={currentHouseholdId}
        households={households}
        onCreateNew={() => {
          void router.push('/households/new');
          setSwitcherOpen(false);
        }}
        onClose={() => setSwitcherOpen(false)}
        onSelect={(id) => { void handleSwitch(id); }}
        visible={switcherOpen}
      />
    </AppShell>
  );
}
