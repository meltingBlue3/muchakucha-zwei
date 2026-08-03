import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { sessionApiClient, sessionTransport } from '../../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../../src/features/households/household-context';
import { HouseholdSettings } from '../../../../src/features/households/household-settings';
import {
  AccessChangedPanel,
  AppShell,
  HouseholdSwitcher,
} from '../../../../src/ui/household-components';
import { Stack, Text } from '../../../../src/ui/primitives';

export default function HouseholdDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const {
    viewState,
    households,
    currentHouseholdId,
    switchHousehold,
    refreshHouseholds,
    enterAccessChanged,
  } = useHouseholdContext();

  const [switcherOpen, setSwitcherOpen] = useState(false);

  const currentHousehold = households.find((h) => h.id === currentHouseholdId) ?? null;

  // Derive the household name from context for the header.
  const householdName = currentHousehold?.name ?? '';

  const deps = useMemo(
    () => ({
      householdApi: sessionApiClient,
      getAccessToken: () => sessionTransport.getAccessToken(),
    }),
    [],
  );

  const handleSwitch = useCallback(async (householdId: string) => {
    if (householdId === currentHouseholdId) {
      setSwitcherOpen(false);
      return;
    }
    const success = await switchHousehold(householdId);
    if (success) {
      void router.replace(`/households/${encodeURIComponent(householdId)}`);
    }
    setSwitcherOpen(false);
  }, [currentHouseholdId, switchHousehold, router]);

  // ---- AccessChanged or member lost access ----
  if (viewState === 'accessChanged') {
    const hasOtherHouseholds = households.length > 0;
    return (
      <AppShell accessibilityLabel="家庭访问权已变化">
        <AccessChangedPanel
          hasOtherHouseholds={hasOtherHouseholds}
          householdName={currentHousehold?.name}
          onChooseOther={() => {
            void router.replace('/households');
          }}
          onCreateNew={() => {
            void router.replace('/household-handoff');
          }}
        />
      </AppShell>
    );
  }

  // ---- Route ID mismatch guard ----
  if (id === undefined || id === '') {
    return (
      <AppShell accessibilityLabel="页面未找到">
        <Stack gap={4}>
          <Text>这个页面暂时无法访问。</Text>
        </Stack>
      </AppShell>
    );
  }

  return (
    <>
      <HouseholdSettings
        deps={deps}
        householdId={id}
        householdName={householdName}
        onOpenSwitcher={() => setSwitcherOpen(true)}
      />
      <HouseholdSwitcher
        currentHouseholdId={currentHouseholdId}
        households={households}
        onCreateNew={() => {
          void router.push('/households/new');
          setSwitcherOpen(false);
        }}
        onClose={() => setSwitcherOpen(false)}
        onSelect={(hid) => { void handleSwitch(hid); }}
        visible={switcherOpen}
      />
    </>
  );
}
