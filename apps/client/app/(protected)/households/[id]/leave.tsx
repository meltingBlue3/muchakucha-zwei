import { useTranslation } from '../../../../src/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ApiClientError } from '@muchakucha/api-client';
import { sessionApiClient, sessionTransport } from '../../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../../src/features/households/household-context';
import { HouseholdActionWindow, useHouseholdActionClose } from '../../../../src/features/households/household-action-window';
import { Banner, ConfirmActions, Stack, Text } from '../../../../src/ui/primitives';

export default function LeaveHouseholdMembershipPage() {
  const { t } = useTranslation(['households', 'auth']);
  const { id, householdName: routeHouseholdName } = useLocalSearchParams<{ id: string; householdName?: string }>();
  const router = useRouter();
  const close = useHouseholdActionClose();
  const exitAllowed = useRef(false);
  const { enterAccessChanged } = useHouseholdContext();
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const householdName = routeHouseholdName ?? t('governance.householdFallback');
  const [error, setError] = useState<'governance.transferRequired' | 'governance.leaveNetworkError' | 'auth:errors.sessionExpired' | null>(null);

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
      enterAccessChanged(routeHouseholdName, id);
      exitAllowed.current = true;
      router.replace('/households');
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) {
        enterAccessChanged(routeHouseholdName, id);
        exitAllowed.current = true;
        router.replace('/households');
        return;
      }
      setError(err instanceof ApiClientError && err.status === 403
        ? 'governance.transferRequired'
        : 'governance.leaveNetworkError');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <HouseholdActionWindow title={t('governance.confirmLeave')} busy={busy} onClose={close} exitAllowed={exitAllowed}>
    <Stack gap={4}>
      {error ? <Banner title={t('governance.leaveFailed')}>{t(error)}</Banner> : null}
      <Text>{t('governance.leaveMemberDetail', { householdName })}</Text>
      <ConfirmActions cancelLabel={t('governance.cancelLeave')} confirmLabel={t('governance.confirmLeave')} destructive busy={busy} onCancel={close} onConfirm={() => void leave()} />
    </Stack>
  </HouseholdActionWindow>;
}
