import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { sessionStateStore } from '../../../../../../src/features/auth/session-runtime';
import { ApiClient } from '@muchakucha/api-client';
import { ConfirmationPage } from '../../../../../../src/ui/household-components';
import { Banner } from '../../../../../../src/ui/primitives';
import { theme } from '../../../../../../src/ui/theme';

const API_ORIGIN = process.env.EXPO_PUBLIC_API_ORIGIN ?? 'http://127.0.0.1:3000';

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

  // Check auth state — redirect if not authenticated.
  const sessionState = sessionStateStore.get();
  if (sessionState.kind !== 'authenticated') {
    router.replace('/login');
    return null;
  }

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

      router.back();
    } catch (_err: unknown) {
      setError('移除失败，当前家庭状态未改变。请重试。');
      setBusy(false);
    }
  }, [householdId, membershipId, router]);

  const handleSafeAction = useCallback(() => {
    router.back();
  }, [router]);

  const isAdminTarget = targetRole === 'ADMIN';

  return (
    <>
      {error !== undefined ? (
        <View style={{ padding: theme.spacing[4] }}>
          <Banner title="成员移除失败">{error}</Banner>
        </View>
      ) : null}
      <ConfirmationPage
        heading={`将 ${displayName} 从家庭中移除？`}
        body={
          isAdminTarget
            ? `${displayName} 将失去对家庭的所有管理权限和访问权。`
            : `${displayName} 将失去对家庭的访问权。此操作不可撤销。`
        }
        safeActionLabel="保留成员资格"
        safeActionOnPress={handleSafeAction}
        destructiveActionLabel="移除成员"
        destructiveActionOnPress={() => { void handleRemove(); }}
        busy={busy}
      />
    </>
  );
}
