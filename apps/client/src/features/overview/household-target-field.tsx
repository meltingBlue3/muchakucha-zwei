import Check from 'lucide-react-native/icons/check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useTranslation } from '../../i18n';
import { HouseholdSeal } from '../../ui/household-seal';
import { Text } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import { useWorkspaceStore } from '../../ui/workspace-state';
import { useHouseholdContext } from '../households/household-context';
import { useHouseholdMarks } from '../households/household-marks';

/**
 * What a new item's draft keeps when it moves to another household: the
 * fields the person wrote, but not the assignees or labels, which are the old
 * household's own.
 */
export function carryToHousehold(field: string, value: unknown): unknown {
  if (field === 'labels') return undefined;
  if (field === 'form' && typeof value === 'object' && value !== null && 'assigneeIds' in value) return { ...value, assigneeIds: [] };
  return value;
}

/**
 * 保存到 on a form opened from the 总览: which household the new item goes to.
 * Choosing another moves the draft there and reopens the form for it.
 */
export function HouseholdTargetField({ householdId, resource }: { householdId: string; resource: 'tasks' | 'events' | 'notes' }) {
  const { t } = useTranslation('overview');
  const router = useRouter();
  const workspace = useWorkspaceStore();
  const { households } = useHouseholdContext();
  const marks = useHouseholdMarks();
  const [open, setOpen] = useState(false);
  const current = households.find(h => h.id === householdId);
  const mark = marks.get(householdId);

  const choose = (next: string) => {
    setOpen(false);
    if (next === householdId) return;
    workspace.move(`draft:${householdId}:${resource}:new:`, `draft:${next}:${resource}:new:`, carryToHousehold);
    router.setParams({ id: next, overview: '1' });
  };

  return (
    <View style={{ gap: theme.spacing[2] }}>
      <Text variant="label">{t('saveTo')}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('saveTo')}：${current?.name ?? ''}`}
        accessibilityHint={t('chooseHousehold')}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(value => !value)}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3], minHeight: theme.controlSizes.touchTarget, paddingHorizontal: theme.spacing[3], borderRadius: theme.borderRadii.md, borderWidth: theme.borderWidths.default, borderColor: theme.colors.border, backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surfaceSubtle })}
      >
        {mark ? <HouseholdSeal {...mark} /> : null}
        <Text style={{ flex: 1 }} numberOfLines={1}>{current?.name ?? ''}</Text>
        <ChevronDown size={theme.controlSizes.icon - 4} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />
      </Pressable>
      {open ? (
        <View accessibilityRole="radiogroup" accessibilityLabel={t('chooseHousehold')} style={{ borderRadius: theme.borderRadii.md, borderWidth: theme.borderWidths.default, borderColor: theme.colors.separator, overflow: 'hidden' }}>
          {households.map((household, index) => {
            const selected = household.id === householdId;
            const option = marks.get(household.id);
            return (
              <Pressable
                key={household.id}
                accessibilityRole="radio"
                accessibilityLabel={household.name}
                accessibilityState={{ checked: selected }}
                onPress={() => choose(household.id)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3], minHeight: theme.controlSizes.touchTarget, paddingHorizontal: theme.spacing[3], borderTopWidth: index > 0 ? theme.borderWidths.default : 0, borderTopColor: theme.colors.separator, backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface })}
              >
                {option ? <HouseholdSeal {...option} /> : null}
                <Text style={{ flex: 1 }} numberOfLines={1}>{household.name}</Text>
                {selected ? <Check size={theme.controlSizes.icon - 2} color={theme.colors.ink} strokeWidth={theme.focus.width} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <Text variant="meta">{t('saveToHint')}</Text>
    </View>
  );
}
