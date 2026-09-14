import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useHouseholdContext } from '../../src/features/households/household-context';
import { HouseholdSetup } from '../../src/ui/account-components';
import { AccessChangedPanel, AppShell } from '../../src/ui/household-components';
import { Spinner, Stack, Text } from '../../src/ui/primitives';
import { theme } from '../../src/ui/theme';

export default function HouseholdHandoffRoute() {
  const router = useRouter();
  const { viewState, households, currentHouseholdId, accessChangedHouseholdName, refreshHouseholds } = useHouseholdContext();
  useEffect(() => {
    if (viewState === 'ready') {
      router.replace(currentHouseholdId !== null ? `/households/${encodeURIComponent(currentHouseholdId)}` : '/households');
    } else if (viewState === 'offlineRetained') {
      router.replace('/households');
    }
  }, [viewState, currentHouseholdId, router]);

  return (
    <AppShell title="设置家庭" accessibilityLabel="设置家庭" showProfile>
      <Stack gap={6} style={{ width: '100%', maxWidth: theme.layout.authCardMaxWidth, alignSelf: 'center' }}>
        {viewState === 'noHousehold' ? (
          <HouseholdSetup onCreate={() => router.push('/households/new')} onJoin={() => router.push('/invite')} />
        ) : viewState === 'accessChanged' ? (
          <AccessChangedPanel hasOtherHouseholds={households.length > 0}
            {...(accessChangedHouseholdName === undefined ? {} : { householdName: accessChangedHouseholdName })}
            onChooseOther={() => { void refreshHouseholds().then(() => router.replace('/households')); }}
            onCreateNew={() => router.push('/households/new')} />
        ) : (
          <Stack gap={4} style={{ alignItems: 'center', padding: theme.spacing[8] }}><Spinner label="正在加载家庭" /><Text variant="bodySm">正在为你打开家庭空间…</Text></Stack>
        )}
      </Stack>
    </AppShell>
  );
}
