import { useTranslation } from '../../../../src/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError } from '@muchakucha/api-client';
import { sessionApiClient, sessionTransport } from '../../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../../src/features/households/household-context';
import { HouseholdActionWindow, useHouseholdActionClose } from '../../../../src/features/households/household-action-window';
import { Banner, ConfirmActions, LoadError, LoadingState, Stack, Text } from '../../../../src/ui/primitives';

/**
 * 离开家庭 without handing anything over: a member or admin leaves, and an
 * owner who is the last member takes the household with them. Which of the two
 * this is comes from the roster read here, not from the link that opened it,
 * so the warning matches what the server will do.
 */
export default function LeaveHouseholdMembershipPage() {
  const { t } = useTranslation(['households', 'auth']);
  const { id, householdName: routeHouseholdName } = useLocalSearchParams<{ id: string; householdName?: string }>();
  const router = useRouter();
  const close = useHouseholdActionClose();
  const exitAllowed = useRef(false);
  const { enterAccessChanged, refreshHouseholds } = useHouseholdContext();
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const householdName = routeHouseholdName ?? t('governance.householdFallback');
  const [error, setError] = useState<'governance.leaveNetworkError' | 'auth:errors.sessionExpired' | null>(null);
  // The caller's place in the roster: the owner alone deletes the household; the owner among others hands over first.
  const [roster, setRoster] = useState<'loading' | 'failed' | { lastMember: boolean; mustTransfer: boolean }>('loading');

  const loadRoster = useCallback(async () => {
    setRoster('loading');
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) { setRoster('failed'); return; }
      const household = await sessionApiClient.getHousehold(token, id);
      const me = household.members.find(member => member.isCurrentUser);
      const owner = me !== undefined && me.membershipId === household.ownerMembershipId;
      setRoster({ lastMember: owner && household.members.length === 1, mustTransfer: owner && household.members.length > 1 });
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) {
        enterAccessChanged(routeHouseholdName, id);
        exitAllowed.current = true;
        router.replace('/households');
        return;
      }
      setRoster('failed');
    }
  }, [id, routeHouseholdName, enterAccessChanged, router]);
  useEffect(() => { void loadRoster(); }, [loadRoster]);

  const lastMember = typeof roster === 'object' && roster.lastMember;
  const mustTransfer = typeof roster === 'object' && roster.mustTransfer;

  async function leave() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setError('auth:errors.sessionExpired');
        return;
      }
      await sessionApiClient.leaveHouseholdMembership(token, id);
      exitAllowed.current = true;
      if (lastMember) {
        // The household is gone, not merely out of reach: open another one, or the setup page.
        void refreshHouseholds();
        router.replace('/household-handoff');
      } else {
        enterAccessChanged(routeHouseholdName, id);
        router.replace('/households');
      }
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) {
        enterAccessChanged(routeHouseholdName, id);
        exitAllowed.current = true;
        router.replace('/households');
        return;
      }
      if (err instanceof ApiClientError && err.status === 403) {
        // Someone joined since this window opened; the owner hands over first again.
        void loadRoster();
        return;
      }
      setError('governance.leaveNetworkError');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <HouseholdActionWindow title={t('governance.confirmLeave')} busy={busy} onClose={close} exitAllowed={exitAllowed} preferCancel={lastMember}>
    {roster === 'loading' ? <LoadingState label={t('settings.loadingMembers')} />
      : roster === 'failed' ? <LoadError message={t('settings.loadMembersFailed')} onRetry={() => void loadRoster()} retryAccessibilityLabel={t('settings.retryMembers')} />
        : <Stack gap={4}>
          {error ? <Banner title={t('governance.leaveFailed')}>{t(error)}</Banner> : mustTransfer ? <Banner>{t('governance.transferRequired')}</Banner> : null}
          <Text>{lastMember ? t('governance.leaveLastMemberDetail', { householdName }) : t('governance.leaveMemberDetail', { householdName })}</Text>
          <ConfirmActions cancelLabel={t('governance.cancelLeave')} confirmLabel={lastMember ? t('governance.confirmLeaveAndDelete') : t('governance.confirmLeave')} destructive alignEnd={lastMember} busy={busy} confirmDisabled={mustTransfer} onCancel={close} onConfirm={() => void leave()} />
        </Stack>}
  </HouseholdActionWindow>;
}
