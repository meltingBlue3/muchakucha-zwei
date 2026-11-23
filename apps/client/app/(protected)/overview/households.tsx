import Bell from 'lucide-react-native/icons/bell';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';

import { useTranslation } from '../../../src/i18n';
import { useHouseholdContext } from '../../../src/features/households/household-context';
import { useHouseholdMarks } from '../../../src/features/households/household-marks';
import { AppShell } from '../../../src/ui/household-components';
import { HouseholdSeal } from '../../../src/ui/household-seal';
import { Banner, Stack, Text } from '../../../src/ui/primitives';
import { RouteWindow } from '../../../src/ui/route-window';
import { theme } from '../../../src/ui/theme';

/**
 * Which households the 总览 shows. Each switch saves at once; the last one
 * left on cannot be turned off, since the 总览 needs a household to show.
 */
export default function OverviewHouseholdsRoute() {
  const { t } = useTranslation(['overview', 'households']);
  const router = useRouter();
  const { households, setOverviewHouseholds } = useHouseholdContext();
  const marks = useHouseholdMarks();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const chosen = households.filter(h => h.inOverview).map(h => h.id);

  const toggle = async (householdId: string, on: boolean) => {
    const next = on ? [...chosen, householdId] : chosen.filter(id => id !== householdId);
    if (next.length === 0) return;
    setSaving(true);
    setFailed(false);
    const saved = await setOverviewHouseholds(next);
    setSaving(false);
    if (!saved) setFailed(true);
  };

  return (
    <RouteWindow title={t('householdsTitle')} resource="households" busy={saving} fallback={<AppShell title={t('title')}><View /></AppShell>}>
      <Stack gap={4}>
        <Text variant="bodySm" color="inkMuted">{t('householdsIntro')}</Text>
        {failed ? <Banner>{t('saveError')}</Banner> : null}
        <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.borderRadii.lg, borderWidth: theme.borderWidths.default, borderColor: theme.colors.separator, overflow: 'hidden' }}>
          {households.map((household, index) => {
            const mark = marks.get(household.id);
            const lastOn = household.inOverview && chosen.length === 1;
            return (
              <View key={household.id} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3], minHeight: theme.controlSizes.touchTarget + theme.spacing[4], paddingHorizontal: theme.spacing[4], paddingVertical: theme.spacing[2], borderTopWidth: index > 0 ? theme.borderWidths.default : 0, borderTopColor: theme.colors.separator }}>
                {mark ? <HouseholdSeal {...mark} size="lg" /> : null}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1}>{household.name}</Text>
                  <Text variant="meta">{t('households:memberCount', { count: household.memberCount })}</Text>
                </View>
                <Switch
                  accessibilityLabel={t('householdsSwitch', { name: household.name })}
                  disabled={saving || lastOn}
                  value={household.inOverview}
                  onValueChange={(on) => { void toggle(household.id, on); }}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                  thumbColor={theme.colors.surface}
                />
              </View>
            );
          })}
        </View>
        <Text variant="meta">{t('householdsKeepOne')}</Text>
        <View style={{ flexDirection: 'row', gap: theme.spacing[3], alignItems: 'flex-start', padding: theme.spacing[4], borderRadius: theme.borderRadii.md, borderWidth: theme.borderWidths.default, borderColor: theme.colors.separator, backgroundColor: theme.colors.surface }}>
          <Bell color={theme.colors.inkMuted} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />
          <View style={{ flex: 1, gap: theme.spacing[1] }}>
            <Text variant="meta">{t('householdsReminders')}</Text>
            <Pressable accessibilityRole="link" onPress={() => router.push('/reminders')} style={({ pressed }) => ({ alignSelf: 'flex-start', opacity: pressed ? 0.6 : 1 })}>
              <Text variant="meta" color="ink" style={{ textDecorationLine: 'underline' }}>{t('openReminders')}</Text>
            </Pressable>
          </View>
        </View>
      </Stack>
    </RouteWindow>
  );
}
