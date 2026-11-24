import ChevronDown from 'lucide-react-native/icons/chevron-down';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';

import { useTranslation } from '../../i18n';
import { AnchoredMenu, MenuItem } from '../../ui/anchored-menu';
import { HouseholdSeal } from '../../ui/household-seal';
import { Button, Inline, Text } from '../../ui/primitives';
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
 * It sits where other forms say which household they save to, and opens a
 * menu over the form. Choosing another moves the draft there and reopens the
 * form for it.
 */
export function HouseholdTargetField({ householdId, resource }: { householdId: string; resource: 'tasks' | 'events' | 'notes' }) {
  const { t } = useTranslation('overview');
  const router = useRouter();
  const workspace = useWorkspaceStore();
  const { households } = useHouseholdContext();
  const marks = useHouseholdMarks();
  const [open, setOpen] = useState(false);
  const trigger = useRef<View>(null);
  const close = useCallback(() => setOpen(false), []);
  const name = households.find(h => h.id === householdId)?.name ?? '';
  const mark = marks.get(householdId);

  const choose = (next: string) => {
    close();
    if (next === householdId) return;
    workspace.move(`draft:${householdId}:${resource}:new:`, `draft:${next}:${resource}:new:`, carryToHousehold);
    router.setParams({ id: next, overview: '1' });
  };

  return (
    <Inline gap={2}>
      <Text variant="bodySm">{t('saveTo')}</Text>
      <Button
        ref={trigger}
        tone="secondary"
        size="compact"
        label={name}
        accessibilityLabel={`${t('saveTo')}：${name}`}
        accessibilityHint={t('chooseHousehold')}
        aria-haspopup="dialog"
        expanded={open}
        style={{ flexShrink: 1 }}
        {...(mark ? { icon: () => <HouseholdSeal {...mark} /> } : {})}
        trailingIcon={(color) => <ChevronDown size={theme.controlSizes.icon - 6} color={color} strokeWidth={theme.controlSizes.iconStroke} />}
        onPress={() => setOpen(true)}
      />
      {open ? (
        <AnchoredMenu label={t('chooseHousehold')} role="radiogroup" trigger={trigger} onClose={close}>
          {households.map(household => {
            const option = marks.get(household.id);
            return (
              <MenuItem
                key={household.id}
                label={household.name}
                leading={option ? <HouseholdSeal {...option} /> : null}
                checked={household.id === householdId}
                initial={household.id === householdId}
                onPress={() => choose(household.id)}
              />
            );
          })}
        </AnchoredMenu>
      ) : null}
    </Inline>
  );
}
