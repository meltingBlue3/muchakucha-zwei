import { HouseholdActionWindow, useHouseholdActionClose } from '../../../../../../src/features/households/household-action-window';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { sessionStateStore } from '../../../../../../src/features/auth/session-runtime';
import { ApiClient } from '@muchakucha/api-client';
import { Banner, Button, Stack, Text } from '../../../../../../src/ui/primitives';

const API_ORIGIN = process.env.EXPO_PUBLIC_API_ORIGIN ?? 'http://localhost:3000';

/**
 * D-09 / D-10 member removal consequence confirmation page.
 *
 * Displays the member name, affected household, and immediate
 * access consequence.  Follows safe-action-first: the safe action
 * returns to the settings page without mutation; the destructive
 * action performs the guarded removal.
 *
 * D-12: when the removed identity is the current user, the response
 * 403/404 on the next household request triggers accessChanged flow
 * (membership loss freeze, cache clear, explicit routing).
 */
export default function RemoveMemberPage() {
  const router = useRouter();
  const close = useHouseholdActionClose();
  const exitAllowed = useRef(false);
  const params = useLocalSearchParams<{
    id: string;
    membershipId: string;
    displayName: string;
    role: string;
  }>();
  const householdId = params.id;
  const membershipId = params.membershipId;
  const displayName = params.displayName ?? '此成员';
  const targetRole = (params.role ?? 'MEMBER') as string;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const handleRemove = useCallback(async () => {
    const accessToken = sessionTransport.getAccessToken();
    if (accessToken === null) return;

    setBusy(true);
    setError(undefined);

    try {
      const apiClient = new ApiClient(API_ORIGIN);
      await apiClient.removeMember(
        accessToken,
        householdId,
        membershipId,
      );

      exitAllowed.current = true;
      close();
    } catch (_err: unknown) {
      setError('移除失败，当前家庭状态未改变。请重试。');
      setBusy(false);
    }
  }, [householdId, membershipId, close]);

  const handleSafeAction = useCallback(() => {
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

  const isAdminTarget = targetRole === 'ADMIN';

  return <HouseholdActionWindow title={`将 ${displayName} 从家庭中移除？`} busy={busy} onClose={handleSafeAction} exitAllowed={exitAllowed}>
    <Stack gap={4}>
      {error ? <Banner title="成员移除失败">{error}</Banner> : null}
      <Text>{isAdminTarget ? `${displayName} 将失去对家庭的所有管理权限和访问权。` : `${displayName} 将失去对家庭的访问权。此操作不可撤销。`}</Text>
      <Button label="保留成员资格" tone="secondary" disabled={busy} onPress={handleSafeAction} />
      <Button label="移除成员" loading={busy} onPress={() => void handleRemove()} />
    </Stack>
  </HouseholdActionWindow>;
}
