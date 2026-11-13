import { useTranslation } from '../../src/i18n';
import { router } from 'expo-router';
import { useCallback } from 'react';
import type { GetHouseholdResponseDto } from '@muchakucha/api-client';
import { sessionApiClient, sessionTransport } from '../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../src/features/households/household-context';
import { AccountScreen } from '../../src/features/households/household-screen';
import { useInbox } from '../../src/features/inbox/use-inbox';
import { InboxList } from '../../src/features/inbox/inbox-list';
import { PageIntro } from '../../src/ui/page-intro';
import { Stack } from '../../src/ui/primitives';

export default function InboxRoute() {
  const { t } = useTranslation(['inbox', 'profile']);
  const { refreshHouseholds, switchHousehold } = useHouseholdContext();
  const getAccessToken = useCallback(() => sessionTransport.getAccessToken(), []);
  const onAccepted = useCallback(async (household: GetHouseholdResponseDto) => {
    await refreshHouseholds();
    await switchHousehold(household.id);
    router.replace(`/households/${household.id}`);
  }, [refreshHouseholds, switchHousehold]);
  const inbox = useInbox({ api: sessionApiClient, getAccessToken, onAccepted });
  return <AccountScreen accessibilityLabel={t('profile:links.inbox.label')} showInbox={false} refreshing={inbox.loading} onRefresh={() => { void inbox.reload(); }}>
    <Stack>
      <PageIntro title={t('profile:links.inbox.label')} {...(!inbox.loading && inbox.messages.length ? { subtitle: t('pendingCount', { count: inbox.messages.length }) } : {})} />
      <InboxList {...inbox} />
    </Stack>
  </AccountScreen>;
}
