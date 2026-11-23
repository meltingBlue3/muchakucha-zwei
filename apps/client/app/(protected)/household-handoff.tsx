import { useTranslation } from '../../src/i18n';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useHouseholdContext } from '../../src/features/households/household-context';
import { HouseholdSetup } from '../../src/ui/account-components';
import { AccessChangedPanel, AppShell } from '../../src/ui/household-components';
import { Spinner, Stack, Text } from '../../src/ui/primitives';
import { theme } from '../../src/ui/theme';

export default function HouseholdHandoffRoute() {
  const { t } = useTranslation('households');
  const router = useRouter();
  const { viewState, households, currentHouseholdId, accessChangedHouseholdName, refreshHouseholds, scope } = useHouseholdContext();
  useEffect(() => {
    if (viewState === 'ready') {
      // Someone with several households opens on the 总览 unless they last looked at one household.
      router.replace(currentHouseholdId === null ? '/households' : scope === 'overview' ? '/overview/today' : `/households/${encodeURIComponent(currentHouseholdId)}`);
    } else if (viewState === 'offlineRetained') {
      router.replace('/households');
    }
  }, [viewState, currentHouseholdId, router, scope]);

  return (
    <AppShell title={t('setupAction')} accessibilityLabel={t('setupAction')} showProfile>
      <Stack gap={6} style={{ width: '100%', maxWidth: theme.layout.authCardMaxWidth, alignSelf: 'center' }}>
        {viewState === 'noHousehold' ? (
          <HouseholdSetup onCreate={() => router.push('/households/new')} onJoin={() => router.push('/inbox')} />
        ) : viewState === 'accessChanged' ? (
          <AccessChangedPanel hasOtherHouseholds={households.length > 0}
            {...(accessChangedHouseholdName === undefined ? {} : { householdName: accessChangedHouseholdName })}
            onChooseOther={() => { void refreshHouseholds().then(() => router.replace('/households')); }}
            onCreateNew={() => router.push('/households/new')} />
        ) : (
          <Stack gap={4} style={{ alignItems: 'center', padding: theme.spacing[8] }}><Spinner label={t('loading')} /><Text variant="bodySm">{t('opening')}</Text></Stack>
        )}
      </Stack>
    </AppShell>
  );
}
