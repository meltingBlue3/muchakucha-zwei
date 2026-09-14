import { PageIntro } from '../../../../src/ui/page-intro';
import { HouseholdNavigation } from '../../../../src/ui/household-navigation';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import Repeat from 'lucide-react-native/icons/repeat';
import Tag from 'lucide-react-native/icons/tag';

import { useHouseholdContext } from '../../../../src/features/households/household-context';
import {
  AccessChangedPanel,
  AppShell,
  HouseholdHeader,
  HouseholdSwitcher,
} from '../../../../src/ui/household-components';
import { Stack, Text } from '../../../../src/ui/primitives';
import type { Theme } from '../../../../src/ui/theme';

export default function HouseholdMoreRoute() {
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

  const currentHousehold = households.find((h) => h.id === (id ?? currentHouseholdId)) ?? null;

  // Derive the household name from context for the header.
  const householdName = currentHousehold?.name ?? '';

  const handleSwitch = useCallback(async (householdId: string) => {
    if (householdId === (id ?? currentHouseholdId)) {
      setSwitcherOpen(false);
      return;
    }
    const success = await switchHousehold(householdId);
    if (success) {
      void router.replace(`/households/${encodeURIComponent(householdId)}/more`);
    }
    setSwitcherOpen(false);
  }, [id, currentHouseholdId, switchHousehold, router]);

  // These must be declared before the early returns below — a hook called
  // only on some renders (e.g. only once `viewState` leaves 'accessChanged')
  // changes the hook count between renders and crashes React ("Rendered
  // fewer hooks than expected"). `id` may still be empty/undefined here;
  // that's fine, these closures aren't invoked until the ready branch below
  // actually renders the buttons that use them.
  const activeTheme = useTheme<Theme>();

  const handleOpenLabels = useCallback(() => {
    void router.push(`/households/${encodeURIComponent(id)}/labels`);
  }, [router, id]);

  const handleOpenRecurrenceRules = useCallback(() => {
    void router.push(`/households/${encodeURIComponent(id)}/recurrence-rules`);
  }, [router, id]);

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

  return (
    <>
      {/* Calendar quick-access */}
      <AppShell accessibilityLabel="家庭空间" title="家庭" showProfile footer={<HouseholdNavigation householdId={id} active="more" />}>
        <Stack gap={4}>
          <HouseholdHeader
            householdName={householdName}
            onOpenSwitcher={() => setSwitcherOpen(true)}
          />

          <PageIntro title="家庭" subtitle="一起照顾好这个家。管理家人、共享分类与重复安排。" />
          {/* Settings quick-access */}
          <Pressable
            onPress={() => void router.push(`/households/${encodeURIComponent(id)}/settings`)}
            accessibilityRole="button"
            accessibilityLabel="打开家庭设置"
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: activeTheme.spacing[3],
              backgroundColor: activeTheme.colors.surface,
              borderRadius: activeTheme.borderRadii.xl,
              padding: activeTheme.spacing[5],
              borderWidth: 1,
              borderColor: activeTheme.colors.separator,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <View style={{ flex: 1 }}>
              <Text variant="label">家庭设置</Text>
              <Text variant="bodySm" color="inkMuted">
                管理成员、发送邀请、重命名家庭
              </Text>
            </View>
            <Text variant="caption" color="coral">
              进入 ›
            </Text>
          </Pressable>
          {/* Labels quick-access */}
          <Pressable
            onPress={handleOpenLabels}
            accessibilityRole="button"
            accessibilityLabel="管理标签"
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: activeTheme.spacing[3],
              backgroundColor: activeTheme.colors.surface,
              borderRadius: activeTheme.borderRadii.xl,
              padding: activeTheme.spacing[5],
              borderWidth: 1,
              borderColor: activeTheme.colors.separator,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Tag size={24} color={activeTheme.colors.coral} strokeWidth={1.5} />
            <View style={{ flex: 1 }}>
              <Text variant="label">标签管理</Text>
              <Text variant="bodySm" color="inkMuted">
                创建和管理标签，给事件和任务分类
              </Text>
            </View>
            <Text variant="caption" color="coral">
              进入 ›
            </Text>
          </Pressable>
          {/* Recurrence management */}
          <Pressable
            onPress={handleOpenRecurrenceRules}
            accessibilityRole="button"
            accessibilityLabel="管理周期规则"
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: activeTheme.spacing[3],
              backgroundColor: activeTheme.colors.surface,
              borderRadius: activeTheme.borderRadii.xl,
              padding: activeTheme.spacing[5],
              borderWidth: 1,
              borderColor: activeTheme.colors.separator,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Repeat size={24} color={activeTheme.colors.teal} strokeWidth={1.5} />
            <View style={{ flex: 1 }}>
              <Text variant="label">周期规则</Text>
              <Text variant="bodySm" color="inkMuted">
                查看和管理所有重复的任务和事件
              </Text>
            </View>
            <Text variant="caption" color="coral">
              进入 ›
            </Text>
          </Pressable>
        </Stack>
      </AppShell>
      <HouseholdSwitcher
        currentHouseholdId={id ?? currentHouseholdId}
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
