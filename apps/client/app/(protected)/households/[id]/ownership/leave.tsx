import { useTranslation } from '../../../../../src/i18n';
import { HouseholdActionWindow, useHouseholdActionClose } from '../../../../../src/features/households/household-action-window';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { sessionTransport } from '../../../../../src/features/auth/session-runtime';
import { sessionStateStore } from '../../../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../../../src/features/households/household-context';
import { ApiClient } from '@muchakucha/api-client';
import { Banner, ConfirmActions, Stack, Text } from '../../../../../src/ui/primitives';

const API_ORIGIN = process.env.EXPO_PUBLIC_API_ORIGIN ?? 'http://localhost:3000';

/**
 * Owner-leave final confirmation page.
 *
 * Stage 1 — Consequence summary: displays the successor member name,
 * household name, and the irreversible consequences of leaving
 * (ownership transferred, membership deleted, access lost).
 *
 * Stage 2 — Confirmation inside the same window
 * with "取消离开" (safe, no mutation) and "确认离开家庭" (destructive)
 * in safe-first DOM order.
 *
 * Recovery: on 204 success, the former owner's membership no longer
 * exists. Route to /households to let the AccessChangedPanel handle the
 * membership-loss state (freeze, clear cache, explicit routing).
 */
export default function LeaveHouseholdPage() {
  const { t } = useTranslation('households');
  const router = useRouter();
  const close = useHouseholdActionClose();
  const exitAllowed = useRef(false);
  const { enterAccessChanged } = useHouseholdContext();
  const params = useLocalSearchParams<{
    id: string;
    successorMembershipId: string;
    successorDisplayName?: string;
    householdName?: string;
  }>();
  const householdId = params.id;
  const successorMembershipId = params.successorMembershipId;
  const successorDisplayName = params.successorDisplayName ?? t('governance.memberFallback');
  const routeHouseholdName = params.householdName;
  const householdName = routeHouseholdName ?? t('governance.householdFallback');

  const [stage, setStage] = useState<'consequence' | 'final'>('consequence');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'governance.leaveError' | undefined>(undefined);

  const handleConfirm = useCallback(async () => {
    const accessToken = sessionTransport.getAccessToken();
    if (accessToken === null) return;

    setBusy(true);
    setError(undefined);

    try {
      const apiClient = new ApiClient(API_ORIGIN);
      await apiClient.leaveHousehold(
        accessToken,
        householdId,
        { successorMembershipId },
      );

      // Membership deleted — route to /households.
      // The AccessChangedPanel / household context will detect the membership
      // loss and render the explicit access-changed explanation before any
      // further routing. If the user has no other households, they land on
      // the create/accept handoff page.
      enterAccessChanged(routeHouseholdName, householdId);
      exitAllowed.current = true;
      router.replace('/households');
    } catch (_err: unknown) {
      setError('governance.leaveError');
      setBusy(false);
      // On failure, return to consequence stage so user can re-evaluate.
      setStage('consequence');
    }
  }, [enterAccessChanged, householdId, routeHouseholdName, successorMembershipId, router, close]);

  const handleCancel = useCallback(() => {
    close();
  }, [close]);

  const handleContinue = useCallback(() => {
    setError(undefined);
    setStage('final');
  }, []);

  // Check auth state — redirect if not authenticated. This must run after
  // every hook above: an early return before a hook call changes the hook
  // count between renders and crashes React ("Rendered fewer hooks than
  // expected").
  const sessionState = sessionStateStore.get();
  if (sessionState.kind !== 'authenticated') {
    router.replace('/login');
    return null;
  }

  const closeStep = () => { if (stage === 'final') setStage('consequence'); else handleCancel(); };
  return <HouseholdActionWindow title={stage === 'final' ? t('governance.confirmLeave') : t('governance.leave')} busy={busy} onClose={closeStep} onBackStep={stage === 'final' ? closeStep : undefined} exitAllowed={exitAllowed}>
    <Stack gap={4}>
      {error ? <Banner>{t(error)}</Banner> : null}
      <Text>{t('governance.leaveOwnerDetail', { householdName, successorDisplayName })}</Text>
      {stage === 'final' ? <Text>{t('governance.finalDetail')}</Text> : null}
      {/* Only the final step commits, so only it carries the destructive treatment. */}
      <ConfirmActions cancelLabel={t('governance.cancelLeave')} confirmLabel={stage === 'consequence' ? t('governance.continue') : t('governance.confirmLeave')} destructive={stage !== 'consequence'} busy={busy} onCancel={() => { exitAllowed.current = true; handleCancel(); }} onConfirm={() => { if (stage === 'consequence') handleContinue(); else void handleConfirm(); }} />
    </Stack>
  </HouseholdActionWindow>;
}
