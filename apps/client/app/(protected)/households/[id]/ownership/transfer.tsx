import { useTranslation } from '../../../../../src/i18n';
import { HouseholdActionWindow, useHouseholdActionClose } from '../../../../../src/features/households/household-action-window';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { sessionTransport } from '../../../../../src/features/auth/session-runtime';
import { sessionStateStore } from '../../../../../src/features/auth/session-runtime';
import { ApiClient } from '@muchakucha/api-client';
import { Banner, ConfirmActions, Stack, Text } from '../../../../../src/ui/primitives';

const API_ORIGIN = process.env.EXPO_PUBLIC_API_ORIGIN ?? 'http://localhost:3000';

/**
 * D-10 / D-11 ownership transfer final confirmation page.
 *
 * Stage 1 — Consequence summary: displays the successor member name,
 * household name, and the irreversible consequences of the transfer
 * (former owner becomes MEMBER, ownership pointer moves).
 *
 * Stage 2 — Confirmation inside the same window
 * with "取消转移" (safe, no mutation) and "确认转移所有权" (destructive)
 * in safe-first DOM order; AppDialog owns focus containment.
 */
export default function TransferOwnershipPage() {
  const { t } = useTranslation('households');
  const router = useRouter();
  const close = useHouseholdActionClose();
  const exitAllowed = useRef(false);
  const params = useLocalSearchParams<{
    id: string;
    successorMembershipId: string;
    successorDisplayName?: string;
    householdName?: string;
  }>();
  const householdId = params.id;
  const successorMembershipId = params.successorMembershipId;
  const successorDisplayName = params.successorDisplayName ?? t('governance.memberFallback');
  const householdName = params.householdName ?? t('governance.householdFallback');

  const [stage, setStage] = useState<'consequence' | 'final'>('consequence');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'governance.transferError' | undefined>(undefined);

  const handleConfirm = useCallback(async () => {
    const accessToken = sessionTransport.getAccessToken();
    if (accessToken === null) return;

    setBusy(true);
    setError(undefined);

    try {
      const apiClient = new ApiClient(API_ORIGIN);
      await apiClient.transferOwnership(
        accessToken,
        householdId,
        { successorMembershipId },
      );

      // Success — navigate back to settings page with updated household state.
      exitAllowed.current = true;
      close();
    } catch (_err: unknown) {
      setError('governance.transferError');
      setBusy(false);
      // On failure, return to consequence stage so user can re-evaluate.
      setStage('consequence');
    }
  }, [householdId, successorMembershipId, router, close]);

  const handleContinue = useCallback(() => {
    setError(undefined);
    setStage('final');
  }, []);

  const handleCancel = useCallback(() => {
    close();
  }, [close]);

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
  return <HouseholdActionWindow title={stage === 'final' ? t('governance.transferFinal') : t('governance.transferTitle')} busy={busy} onClose={closeStep} onBackStep={stage === 'final' ? closeStep : undefined} exitAllowed={exitAllowed}>
    <Stack gap={4}>
      {error ? <Banner>{t(error)}</Banner> : null}
      <Text>{t('governance.transferDetail', { householdName, successorDisplayName })}</Text>
      {stage === 'final' ? <Text>{t('governance.finalDetail')}</Text> : null}
      {/* Only the final step commits, so only it carries the destructive treatment. */}
      <ConfirmActions cancelLabel={t('governance.cancelTransfer')} confirmLabel={stage === 'consequence' ? t('governance.continue') : t('governance.confirmTransfer')} destructive={stage !== 'consequence'} busy={busy} onCancel={() => { exitAllowed.current = true; handleCancel(); }} onConfirm={() => { if (stage === 'consequence') handleContinue(); else void handleConfirm(); }} />
    </Stack>
  </HouseholdActionWindow>;
}
