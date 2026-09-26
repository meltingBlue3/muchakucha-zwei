import { HouseholdActionWindow, useHouseholdActionClose } from '../../../../../../src/features/households/household-action-window';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { sessionStateStore } from '../../../../../../src/features/auth/session-runtime';
import { ApiClient } from '@muchakucha/api-client';
import { Banner, Button, Stack, Text } from '../../../../../../src/ui/primitives';

const API_ORIGIN = process.env.EXPO_PUBLIC_API_ORIGIN ?? 'http://localhost:3000';

/**
 * D-09 / D-10 role change confirmation page.
 *
 * - Promotion (MEMBER->ADMIN): direct confirmation with non-destructive button.
 * - Demotion (ADMIN->MEMBER): Window confirmation with safe-action-first ordering.
 */
export default function ChangeMemberRolePage() {
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
  const currentRole = (params.role ?? 'MEMBER') as 'ADMIN' | 'MEMBER';

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const isPromotion = currentRole === 'MEMBER';
  const newRole: 'ADMIN' | 'MEMBER' = isPromotion ? 'ADMIN' : 'MEMBER';

  const handleRoleChange = useCallback(async () => {
    const accessToken = sessionTransport.getAccessToken();
    if (accessToken === null) return;

    setBusy(true);
    setError(undefined);

    try {
      const apiClient = new ApiClient(API_ORIGIN);
      await apiClient.changeMemberRole(
        accessToken,
        householdId,
        membershipId,
        { role: newRole },
      );

      exitAllowed.current = true;
      close();
    } catch (_err: unknown) {
      setError('没有完成，当前家庭状态未改变。请重试。');
      setBusy(false);
    }
  }, [householdId, membershipId, newRole, close]);

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

  return <HouseholdActionWindow title={isPromotion ? `将 ${displayName} 提升为管理员？` : `将 ${displayName} 改为成员？`} busy={busy} onClose={handleSafeAction} exitAllowed={exitAllowed}>
    <Stack gap={4}>
      {error ? <Banner title="角色变更失败">{error}</Banner> : null}
      <Text>{isPromotion ? '对方将获得邀请和管理普通成员的权限。' : '对方将不能再邀请或管理成员。'}</Text>
      <Button label={isPromotion ? '保留成员权限' : '保留管理员权限'} tone="secondary" disabled={busy} onPress={handleSafeAction} />
      <Button label={isPromotion ? '确认提升为管理员' : '降级为成员'} loading={busy} onPress={() => void handleRoleChange()} />
    </Stack>
  </HouseholdActionWindow>;
}
