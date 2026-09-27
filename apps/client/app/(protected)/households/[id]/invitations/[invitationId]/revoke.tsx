import { HouseholdActionWindow, useHouseholdActionClose } from '../../../../../../src/features/households/household-action-window';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { sessionStateStore } from '../../../../../../src/features/auth/session-runtime';
import { ApiClient } from '@muchakucha/api-client';
import { Banner, ConfirmActions, Stack, Text } from '../../../../../../src/ui/primitives';

const API_ORIGIN = process.env.EXPO_PUBLIC_API_ORIGIN ?? 'http://localhost:3000';

export default function RevokeInvitationPage() {
  const router = useRouter();
  const close = useHouseholdActionClose();
  const exitAllowed = useRef(false);
  const { id: householdId, invitationId } = useLocalSearchParams<{
    id: string;
    invitationId: string;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const handleSafeAction = useCallback(() => {
    close();
  }, [close]);

  const handleRevoke = useCallback(async () => {
    const accessToken = sessionTransport.getAccessToken();
    if (accessToken === null) return;

    setBusy(true);
    setError(undefined);

    try {
      const apiClient = new ApiClient(API_ORIGIN);
      await apiClient.revokeInvitation(
        accessToken,
        householdId,
        invitationId,
      );

      exitAllowed.current = true;
      close();
    } catch (_err: unknown) {
      setError('撤销失败，家庭邀请状态未改变。请重试。');
      setBusy(false);
    }
  }, [householdId, invitationId, close]);

  // Check auth state — redirect if not authenticated. This must run after
  // every hook above: an early return before a hook call changes the hook
  // count between renders and crashes React ("Rendered fewer hooks than
  // expected").
  const sessionState = sessionStateStore.get();
  if (sessionState.kind !== 'authenticated') {
    router.replace('/login');
    return null;
  }

  return <HouseholdActionWindow title="撤销邀请？" busy={busy} onClose={handleSafeAction} exitAllowed={exitAllowed}>
    <Stack gap={4}>
      {error ? <Banner title="撤销失败">{error}</Banner> : null}
      <Text>撤销后，对方将无法接受这份邀请。</Text>
      <ConfirmActions cancelLabel="保留邀请" confirmLabel="撤销邀请" destructive busy={busy} onCancel={handleSafeAction} onConfirm={() => void handleRevoke()} />
    </Stack>
  </HouseholdActionWindow>;
}
