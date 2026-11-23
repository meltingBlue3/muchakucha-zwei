import { View } from 'react-native';

import { useTranslation } from '../../i18n';
import { DetailField } from '../../ui/detail-fields';
import { HouseholdSeal } from '../../ui/household-seal';
import { Text } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import { useDesktop } from '../../ui/use-desktop';
import { useHouseholdContext } from '../households/household-context';
import { useHouseholdMarks } from '../households/household-marks';

/**
 * 家庭 in an event's or a task's detail: the household it belongs to, with its
 * seal. Only someone in two or more households sees it; with one there is
 * nothing to tell apart.
 */
export function HouseholdDetailField({ householdId }: { householdId: string }) {
  const { t } = useTranslation('overview');
  const desktop = useDesktop();
  const { households } = useHouseholdContext();
  const marks = useHouseholdMarks();
  const mark = marks.get(householdId);
  if (households.length < 2 || mark === undefined) return null;
  return (
    <DetailField
      label={t('household')}
      value={<View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}>
        <HouseholdSeal {...mark} size="sm" />
        <Text variant={desktop ? 'bodySm' : 'body'} color="ink" style={{ flexShrink: 1 }}>{mark.name}</Text>
      </View>}
    />
  );
}
