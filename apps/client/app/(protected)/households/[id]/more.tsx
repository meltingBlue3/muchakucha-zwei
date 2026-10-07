import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import ChevronRight from 'lucide-react-native/icons/chevron-right';

import { HouseholdScreen } from '../../../../src/features/households/household-screen';
import { useHouseholdContext } from '../../../../src/features/households/household-context';
import { ListGroup, ListRow, RowSlot } from '../../../../src/ui/list-group';
import { familyPages, householdPath } from '../../../../src/ui/household-navigation';
import { PageIntro } from '../../../../src/ui/page-intro';
import { Stack, Text } from '../../../../src/ui/primitives';
import { theme } from '../../../../src/ui/theme';

const DESCRIPTIONS: Record<typeof familyPages[number]['key'], { name: string; description: string }> = {
  settings: { name: '打开家庭设置', description: '成员、邀请和家庭名称' },
  labels: { name: '管理标签', description: '给日程和任务分类' },
  'recurrence-rules': { name: '管理重复安排', description: '管理重复的日程和任务' },
};

/** The household's own pages in one list; phones also reach them from the household menu. */
export default function HouseholdMoreRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { currentHouseholdId } = useHouseholdContext();
  const householdId = id ?? currentHouseholdId ?? '';

  return (
    <HouseholdScreen active="more" accessibilityLabel="家庭空间" width="reading">
      <Stack gap={5}>
        <PageIntro title="家庭" />
        <ListGroup>
          {familyPages.map(({ key, label, icon: Icon }) => (
            <ListRow
              key={key}
              accessibilityLabel={DESCRIPTIONS[key].name}
              onPress={() => router.push(householdPath(householdId, key))}
              leading={<RowSlot width={theme.controlSizes.touchTarget}><View style={{ alignItems: 'center' }}><Icon size={theme.controlSizes.icon} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} /></View></RowSlot>}
              trailing={<ChevronRight size={theme.controlSizes.icon} color={theme.colors.inkFaint} strokeWidth={theme.controlSizes.iconStroke} />}
            >
              <Text variant="body">{label}</Text>
              <Text variant="meta">{DESCRIPTIONS[key].description}</Text>
            </ListRow>
          ))}
        </ListGroup>
      </Stack>
    </HouseholdScreen>
  );
}
