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
import { Banner, Button, Spinner, Stack, Text } from '../../../src/ui/primitives';
import { theme } from '../../../src/ui/theme';

export default function HouseholdsIndexRoute() {
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
      <AppShell accessibilityLabel="家庭访问权已变化">
        <AccessChangedPanel
          hasOtherHouseholds={hasOtherHouseholds}
          {...(accessChangedHouseholdName === undefined ? {} : { householdName: accessChangedHouseholdName })}
          onChooseOther={() => {
            void refreshHouseholds();
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
  if (viewState === 'noHousehold') {
    return (
      <AppShell accessibilityLabel="还没有家庭" title="设置家庭" showProfile>
        <Stack style={{ width: '100%', maxWidth: theme.layout.authCardMaxWidth, alignSelf: 'center' }}>
          <HouseholdSetup onCreate={() => router.push('/households/new')} onJoin={() => router.push('/invite')} />
        </Stack>
      </AppShell>
    );
  }

  // ---- Ready (with households) ----
  return (
    <AppShell accessibilityLabel="家庭选择" title="我的家庭" showProfile>
      <Stack gap={6}>
        {currentHousehold !== null ? (
          <HouseholdHeader
            householdName={currentHousehold.name}
            onOpenSwitcher={() => setSwitcherOpen(true)}
          />
        ) : null}

        {viewState === 'offlineRetained' ? (
          <Stack gap={3}><Banner title="暂时无法连接">当前为离线内容，管理操作需要联网。家庭列表为空时，也不代表你尚未加入家庭。</Banner><Button label="重新加载家庭" loading={isSwitching} onPress={() => void handleRetrySwitch()} /></Stack>
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
