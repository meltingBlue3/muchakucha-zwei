import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useTranslation } from '../../i18n';
import { rememberRouteTrigger } from '../../platform/overlays/route-trigger';
import { HouseholdSeal } from '../../ui/household-seal';
import { Text } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import { useDesktopDensity } from '../../ui/use-desktop';
import { useHouseholdContext } from '../households/household-context';
import { overviewHouseholds, useHouseholdMarks } from '../households/household-marks';

/** On the 总览's 今日: which households it shows, each with its seal, and the way to change them. 日历 and 任务 leave this to the switch. */
export function OverviewLegend() {
  const { t } = useTranslation('overview');
  const router = useRouter();
  const dense = useDesktopDensity();
  const { households } = useHouseholdContext();
  const marks = useHouseholdMarks();
  const included = overviewHouseholds(households);
  return (
    <View accessibilityRole="list" accessibilityLabel={t('legend')} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.spacing[2] }}>
      {included.map(household => {
        const mark = marks.get(household.id);
        return (
          <View key={household.id} accessibilityRole="text" style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[1] + 2, height: dense ? theme.spacing[6] + 4 : theme.spacing[8] - 4, paddingLeft: theme.spacing[1] + 1, paddingRight: theme.spacing[2] + 2, borderRadius: theme.borderRadii.full, borderWidth: theme.borderWidths.default, borderColor: theme.colors.outline, backgroundColor: theme.colors.surface }}>
            {mark ? <HouseholdSeal {...mark} /> : null}
            <Text variant="meta" color="ink" numberOfLines={1}>{household.name}</Text>
          </View>
        );
      })}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('adjustLabel')}
        onPress={() => { rememberRouteTrigger(); router.push('/overview/households'); }}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ minHeight: dense ? theme.spacing[6] + 4 : theme.controlSizes.touchTarget, justifyContent: 'center', paddingHorizontal: theme.spacing[2], borderRadius: theme.borderRadii.sm, backgroundColor: hovered ? theme.colors.surfaceMuted : theme.colors.transparent, opacity: pressed ? 0.6 : 1 })}
      >
        <Text variant="meta" color="ink" style={{ textDecorationLine: 'underline' }}>{t('adjust')}</Text>
      </Pressable>
    </View>
  );
}

/**
 * Says how many open tasks the 总览 leaves out because they are other family
 * members', with the switch to show them; once shown, the switch goes back.
 */
export function OthersHiddenNote({ count, showAll, onToggle }: { count: number; showAll: boolean; onToggle(): void }) {
  const { t } = useTranslation('overview');
  if (!showAll && count === 0) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: theme.spacing[2], rowGap: theme.spacing[1], paddingHorizontal: theme.spacing[1] }}>
      {!showAll ? <Text variant="meta" style={{ flexShrink: 1 }}>{t('othersHidden', { count })}</Text> : null}
      <Pressable accessibilityRole="button" onPress={onToggle} hitSlop={theme.spacing[2]} style={({ pressed }) => ({ minHeight: theme.spacing[8], justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
        <Text variant="meta" color="ink" style={{ textDecorationLine: 'underline' }}>{showAll ? t('showMine') : t('showAll')}</Text>
      </Pressable>
    </View>
  );
}

/** Under 接下来: the households the 总览 leaves out, so an empty day is not mistaken for a free one. */
export function NotIncludedNote() {
  const { t } = useTranslation(['overview', 'households']);
  const { households } = useHouseholdContext();
  const left = households.filter(household => !household.inOverview);
  if (left.length === 0) return null;
  return <Text variant="caption" color="inkFaint">{t('notIncluded', { households: left.map(h => h.name).join(t('households:overview.separator')) })}</Text>;
}
