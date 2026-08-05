import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import Calendar from 'lucide-react-native/icons/calendar';
import ListTodo from 'lucide-react-native/icons/list-todo';
import Sunrise from 'lucide-react-native/icons/sunrise';

import { sessionApiClient, sessionTransport } from '../../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../../src/features/households/household-context';
import { HouseholdSettings } from '../../../../src/features/households/household-settings';
import {
  AccessChangedPanel,
  AppShell,
  HouseholdSwitcher,
} from '../../../../src/ui/household-components';
import { Stack, Text } from '../../../../src/ui/primitives';
import type { Theme } from '../../../../src/ui/theme';

export default function HouseholdDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
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
          {...(accessChangedHouseholdName === undefined ? {} : { householdName: accessChangedHouseholdName })}
          onChooseOther={() => {
            void refreshHouseholds().then(() => router.replace('/households'));
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

  const activeTheme = useTheme<Theme>();

  const handleOpenToday = useCallback(() => {
    void router.push(`/households/${encodeURIComponent(id)}/today`);
  }, [router, id]);

  const handleOpenCalendar = useCallback(() => {
    void router.push(`/households/${encodeURIComponent(id)}/events`);
  }, [router, id]);

  const handleOpenTasks = useCallback(() => {
    void router.push(`/households/${encodeURIComponent(id)}/tasks`);
  }, [router, id]);

  return (
    <>
      {/* Calendar quick-access */}
      <AppShell accessibilityLabel="家庭详情">
        <Stack gap={4}>
          {/* Today quick-access */}
          <Pressable
            onPress={handleOpenToday}
            accessibilityLabel="打开今日视图"
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: activeTheme.spacing[3],
              backgroundColor: activeTheme.colors.coralSoft,
              borderRadius: activeTheme.borderRadii.md,
              padding: activeTheme.spacing[4],
              borderWidth: 1,
              borderColor: activeTheme.colors.coral,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Sunrise size={24} color={activeTheme.colors.coral} />
            <View style={{ flex: 1 }}>
              <Text variant="label">今日视图</Text>
              <Text variant="bodySm" color="inkMuted">
                查看今天的日程、待办和任务
              </Text>
            </View>
            <Text variant="caption" color="coral">
              进入 ›
            </Text>
          </Pressable>
          <Pressable
            onPress={handleOpenCalendar}
            accessibilityLabel="打开家庭日历"
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: activeTheme.spacing[3],
              backgroundColor: activeTheme.colors.surface,
              borderRadius: activeTheme.borderRadii.md,
              padding: activeTheme.spacing[4],
              borderWidth: 1,
              borderColor: activeTheme.colors.border,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Calendar size={24} color={activeTheme.colors.coral} strokeWidth={1.5} />
            <View style={{ flex: 1 }}>
              <Text variant="label">家庭日历</Text>
              <Text variant="bodySm" color="inkMuted">
                查看和管理家庭共享事件
              </Text>
            </View>
            <Text variant="caption" color="coral">
              进入 ›
            </Text>
          </Pressable>
          {/* Tasks quick-access */}
          <Pressable
            onPress={handleOpenTasks}
            accessibilityLabel="打开家庭任务"
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: activeTheme.spacing[3],
              backgroundColor: activeTheme.colors.surface,
              borderRadius: activeTheme.borderRadii.md,
              padding: activeTheme.spacing[4],
              borderWidth: 1,
              borderColor: activeTheme.colors.border,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <ListTodo size={24} color={activeTheme.colors.teal} strokeWidth={1.5} />
            <View style={{ flex: 1 }}>
              <Text variant="label">家庭任务</Text>
              <Text variant="bodySm" color="inkMuted">
                查看和管理共享任务
              </Text>
            </View>
            <Text variant="caption" color="coral">
              进入 ›
            </Text>
          </Pressable>
          <HouseholdSettings
            deps={deps}
            householdId={id}
            householdName={householdName}
            onOpenSwitcher={() => setSwitcherOpen(true)}
          />
        </Stack>
      </AppShell>
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
