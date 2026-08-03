import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { sessionTransport } from '../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../src/features/households/household-context';
import {
  AccessChangedPanel,
  AppShell,
  HouseholdCard,
  HouseholdHeader,
  HouseholdSwitcher,
  SwitchErrorBanner,
} from '../../../src/ui/household-components';
import { Banner, Button, Heading, Spinner, Stack, Text } from '../../../src/ui/primitives';
import { theme } from '../../../src/ui/theme';

export default function HouseholdsIndexRoute() {
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
  const [switchError, setSwitchError] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  const currentHousehold = households.find((h) => h.id === currentHouseholdId) ?? null;

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
      <AppShell accessibilityLabel="家庭访问权已变化">
        <AccessChangedPanel
          hasOtherHouseholds={hasOtherHouseholds}
          householdName={currentHousehold?.name}
          onChooseOther={() => {
            // Navigate back to selector.
            void router.replace('/households');
          }}
          onCreateNew={() => {
            // Navigate to D-01 handoff.
            void router.replace('/household-handoff');
          }}
        />
      </AppShell>
    );
  }

  // ---- Resolving state ----
  if (viewState === 'resolving') {
    return (
      <AppShell accessibilityLabel="正在加载家庭">
        <Stack accessibilityLabel="正在加载家庭列表" gap={6} style={{ alignItems: 'center', paddingTop: 48 }}>
          <Spinner label="正在加载家庭" />
          <Text variant="bodySm">正在加载家庭列表</Text>
        </Stack>
      </AppShell>
    );
  }

  // ---- Offline retained or ready with no households ----
  if (viewState === 'noHousehold' || (viewState === 'offlineRetained' && households.length === 0)) {
    return (
      <AppShell accessibilityLabel="还没有家庭">
        <Stack gap={6}>
          <Stack gap={2}>
            <Heading>还没有家庭</Heading>
            <Text>创建一个家庭，或打开邀请链接加入家人的家庭。</Text>
          </Stack>
          <Button
            label="创建家庭"
            onPress={() => void router.push('/households/new')}
          />
        </Stack>
      </AppShell>
    );
  }

  // ---- Ready (with households) ----
  return (
    <AppShell accessibilityLabel="家庭选择">
      <Stack gap={6}>
        {currentHousehold !== null ? (
          <HouseholdHeader
            householdName={currentHousehold.name}
            onOpenSwitcher={() => setSwitcherOpen(true)}
          />
        ) : null}

        {viewState === 'offlineRetained' ? (
          <Banner title="离线">当前为离线内容，管理操作需要联网</Banner>
        ) : null}

        {switchError && currentHousehold !== null ? (
          <SwitchErrorBanner
            householdName={currentHousehold.name}
            onRetry={() => void handleRetrySwitch()}
          />
        ) : null}

        {isSwitching ? (
          <Stack gap={4} style={{ alignItems: 'center', paddingVertical: theme.spacing[8] }}>
            <Spinner label="正在切换家庭" />
            <Text variant="bodySm">正在切换家庭</Text>
          </Stack>
        ) : (
          <Stack gap={4}>
            <Text variant="bodySm">
              {currentHousehold !== null
                ? '本设备上次选择的家庭已在列表顶部。选择另一个家庭即可切换。'
                : '选择一个家庭继续。'}
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
              label="创建家庭"
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
