import { router } from 'expo-router';
import { useCallback } from 'react';
import type { GetHouseholdResponseDto } from '@muchakucha/api-client';
import { sessionApiClient, sessionTransport } from '../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../src/features/households/household-context';
import { useInbox } from '../../src/features/inbox/use-inbox';
import { InboxList } from '../../src/features/inbox/inbox-list';
import { AppShell } from '../../src/ui/household-components';
import { Stack } from '../../src/ui/primitives';
import { theme } from '../../src/ui/theme';

export default function InboxRoute() {
  const { refreshHouseholds, switchHousehold } = useHouseholdContext();
  const getAccessToken = useCallback(() => sessionTransport.getAccessToken(), []);
  const onAccepted = useCallback(async (household: GetHouseholdResponseDto) => {
    await refreshHouseholds();
    await switchHousehold(household.id);
    router.replace(`/households/${household.id}`);
  }, [refreshHouseholds, switchHousehold]);
  const inbox = useInbox({ api: sessionApiClient, getAccessToken, onAccepted });
  return <AppShell refreshing={inbox.loading} onRefresh={() => { void inbox.reload(); }} title="收件箱" accessibilityLabel="收件箱" showBack showProfile onBack={() => router.canGoBack() ? router.back() : router.replace('/household-handoff')}>
    <Stack style={{ width: '100%', maxWidth: theme.layout.householdMaxWidth, alignSelf: 'center' }}>
      <InboxList {...inbox} />
    </Stack>
  </AppShell>;
}
