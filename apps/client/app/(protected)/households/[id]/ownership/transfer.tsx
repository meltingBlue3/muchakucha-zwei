import { HouseholdActionWindow, useHouseholdActionClose } from '../../../../../src/features/households/household-action-window';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { sessionTransport } from '../../../../../src/features/auth/session-runtime';
import { sessionStateStore } from '../../../../../src/features/auth/session-runtime';
import { ApiClient } from '@muchakucha/api-client';
import { Banner, Button, Stack, Text } from '../../../../../src/ui/primitives';

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
      await apiClient.transferOwnership(
        accessToken,
        householdId,
        { successorMembershipId },
      );

      // Success — navigate back to settings page with updated household state.
      exitAllowed.current = true;
      close();
    } catch (_err: unknown) {
      setError('所有权转移失败，当前家庭状态未改变。请重试。');
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
  return <HouseholdActionWindow title={stage === 'final' ? '最终确认：转移所有权' : '转移家庭所有权'} busy={busy} onClose={closeStep} onBackStep={stage === 'final' ? closeStep : undefined} exitAllowed={exitAllowed}>
    <Stack gap={4}>
      {error ? <Banner>{error}</Banner> : null}
      <Text>你即将把「{householdName}」的所有权转移给 {successorDisplayName}。转移后你将成为普通成员，失去管理家庭的权限。</Text>
      {stage === 'final' ? <Text>请确认上述变更。此操作不可撤销。</Text> : null}
      <Button label="取消转移" tone="secondary" disabled={busy} onPress={() => { exitAllowed.current = true; handleCancel(); }} />
      {stage === 'consequence' ? <Button label="继续" onPress={handleContinue} /> : <Button label="确认转移所有权" loading={busy} onPress={() => void handleConfirm()} />}
    </Stack>
  </HouseholdActionWindow>;
}
