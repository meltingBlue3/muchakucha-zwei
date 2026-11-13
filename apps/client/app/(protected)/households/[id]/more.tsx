import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import ChevronRight from 'lucide-react-native/icons/chevron-right';

import { HouseholdScreen } from '../../../../src/features/households/household-screen';
import { useHouseholdContext } from '../../../../src/features/households/household-context';
import { useTranslation } from '../../../../src/i18n';
import { ListGroup, ListRow, RowSlot } from '../../../../src/ui/list-group';
import { familyPages, householdPath } from '../../../../src/ui/household-navigation';
import { PageIntro } from '../../../../src/ui/page-intro';
import { Stack, Text } from '../../../../src/ui/primitives';
import { theme } from '../../../../src/ui/theme';

/** The household's own pages in one list; phones also reach them from the household menu. */
export default function HouseholdMoreRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { currentHouseholdId } = useHouseholdContext();
  const householdId = id ?? currentHouseholdId ?? '';
  const { t } = useTranslation(['householdMore', 'navigation']);

  return (
    <HouseholdScreen active="more" accessibilityLabel={t('main')} width="reading">
      <Stack gap={5}>
        <PageIntro title={t('navigation:family')} />
        <ListGroup>
          {familyPages.map(({ key, icon: Icon }) => (
            <ListRow
              key={key}
              accessibilityLabel={t(`pages.${key}.name`)}
              onPress={() => router.push(householdPath(householdId, key))}
              leading={<RowSlot width={theme.controlSizes.touchTarget}><View style={{ alignItems: 'center' }}><Icon size={theme.controlSizes.icon} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} /></View></RowSlot>}
              trailing={<ChevronRight size={theme.controlSizes.icon} color={theme.colors.inkFaint} strokeWidth={theme.controlSizes.iconStroke} />}
            >
              <Text variant="body">{t(`navigation:pages.${key}`)}</Text>
              <Text variant="meta">{t(`pages.${key}.description`)}</Text>
            </ListRow>
          ))}
        </ListGroup>
      </Stack>
    </HouseholdScreen>
  );
}
