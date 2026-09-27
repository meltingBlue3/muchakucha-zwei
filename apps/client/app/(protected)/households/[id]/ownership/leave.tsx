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
 * D-11 owner-leave final confirmation page.
 *
 * Stage 1 — Consequence summary: displays the successor member name,
 * household name, and the irreversible consequences of leaving
 * (ownership transferred, membership deleted, access lost).
 *
 * Stage 2 — Confirmation inside the same window
 * with "取消离开" (safe, no mutation) and "确认离开家庭" (destructive)
 * in safe-first DOM order.
 *
 * D-12 recovery: on 204 success, the former owner's membership no longer
 * exists. Route to /households to let the AccessChangedPanel handle the
 * membership-loss state (freeze, clear cache, explicit routing).
 */
export default function LeaveHouseholdPage() {
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
  const successorDisplayName = params.successorDisplayName ?? '此成员';
  const householdName = params.householdName ?? '此家庭';

  const [stage, setStage] = useState<'consequence' | 'final'>('consequence');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

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

      // D-12: membership deleted — route to /households.
      // The AccessChangedPanel / household context will detect the membership
      // loss and render the explicit access-changed explanation before any
      // further routing. If the user has no other households, they land on
      // the D-01 create/accept handoff page.
      enterAccessChanged(householdName, householdId);
      exitAllowed.current = true;
      router.replace('/households');
    } catch (_err: unknown) {
      setError('离开家庭失败，当前家庭状态未改变。请重试。');
      setBusy(false);
      // On failure, return to consequence stage so user can re-evaluate.
      setStage('consequence');
    }
  }, [enterAccessChanged, householdId, householdName, successorMembershipId, router, close]);

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
  return <HouseholdActionWindow title={stage === 'final' ? '确认离开家庭' : '离开家庭'} busy={busy} onClose={closeStep} onBackStep={stage === 'final' ? closeStep : undefined} exitAllowed={exitAllowed}>
    <Stack gap={4}>
      {error ? <Banner>{error}</Banner> : null}
      <Text>你即将离开「{householdName}」，并将所有权移交给 {successorDisplayName}。离开后你将无法访问家庭，共享日程、任务和笔记会保留在家庭中。</Text>
      {stage === 'final' ? <Text>请确认上述变更。此操作不可撤销。</Text> : null}
      {/* Only the final step commits, so only it carries the destructive treatment. */}
      <ConfirmActions cancelLabel="取消离开" confirmLabel={stage === 'consequence' ? '继续' : '确认离开家庭'} destructive={stage !== 'consequence'} busy={busy} onCancel={() => { exitAllowed.current = true; handleCancel(); }} onConfirm={() => { if (stage === 'consequence') handleContinue(); else void handleConfirm(); }} />
    </Stack>
  </HouseholdActionWindow>;
}
