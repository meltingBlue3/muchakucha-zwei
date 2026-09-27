import { PageIntro } from '../../../../src/ui/page-intro';
import { HouseholdNavigation } from '../../../../src/ui/household-navigation';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import Repeat from 'lucide-react-native/icons/repeat';
import Tag from 'lucide-react-native/icons/tag';
import Settings from 'lucide-react-native/icons/settings';
import ChevronRight from 'lucide-react-native/icons/chevron-right';

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
      <AppShell accessibilityLabel="家庭空间" title="家庭" showProfile headerContent={<HouseholdHeader
            householdName={householdName}
            onOpenSwitcher={() => setSwitcherOpen(true)}
          />} footer={<HouseholdNavigation householdId={id} active="more" />}>
        <Stack gap={4}>


          <PageIntro title="家庭" />
          <View style={{ backgroundColor: activeTheme.colors.surface, borderRadius: activeTheme.borderRadii.xl, paddingHorizontal: activeTheme.spacing[4] }}>
            {[
              { name: '家庭设置', label: '打开家庭设置', description: '成员、邀请和家庭名称', Icon: Settings, onPress: () => router.push(`/households/${encodeURIComponent(id)}/settings`) },
              { name: '标签管理', label: '管理标签', description: '给日程和任务分类', Icon: Tag, onPress: handleOpenLabels },
              { name: '重复安排', label: '管理重复安排', description: '管理重复的日程和任务', Icon: Repeat, onPress: handleOpenRecurrenceRules },
            ].map(({ name, label, description, Icon, onPress }, index) => <Pressable key={name} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: activeTheme.spacing[3], paddingVertical: activeTheme.spacing[4], borderTopWidth: index ? activeTheme.borderWidths.default : 0, borderColor: activeTheme.colors.separator, opacity: pressed ? 0.7 : 1 })}>
              <Icon size={activeTheme.controlSizes.icon} color={activeTheme.colors.coral} strokeWidth={activeTheme.controlSizes.iconStroke} />
              <Stack gap={1} style={{ flex: 1 }}><Text variant="label">{name}</Text><Text variant="bodySm" color="inkMuted">{description}</Text></Stack>
              <ChevronRight size={activeTheme.controlSizes.icon} color={activeTheme.colors.inkMuted} />
            </Pressable>)}
          </View>
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
