import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { sessionStateStore } from '../../../../../../src/features/auth/session-runtime';
import { ApiClient } from '@muchakucha/api-client';
import { ConfirmationPage } from '../../../../../../src/ui/household-components';
import { Banner } from '../../../../../../src/ui/primitives';
import { theme } from '../../../../../../src/ui/theme';

const API_ORIGIN = process.env.EXPO_PUBLIC_API_ORIGIN ?? 'http://localhost:3000';

export default function RevokeInvitationPage() {
  const router = useRouter();
  const { id: householdId, invitationId } = useLocalSearchParams<{
    id: string;
    invitationId: string;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  // Check auth state - if not authenticated, redirect
  const sessionState = sessionStateStore.get();
  if (sessionState.kind !== 'authenticated') {
    router.replace('/login');
    return null;
  }

  const handleSafeAction = useCallback(() => {
    router.back();
  }, [router]);

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

      router.back();
    } catch (_err: unknown) {
      setError('撤销失败，家庭邀请状态未改变。请重试。');
      setBusy(false);
    }
  }, [householdId, invitationId, router]);

  return (
    <>
      {error !== undefined ? (
        <View style={{ padding: theme.spacing[4] }}>
          <Banner title="撤销失败">{error}</Banner>
        </View>
      ) : null}
      <ConfirmationPage
        heading="撤销邀请？"
        body="撤销后，原链接将不能使用。"
        safeActionLabel="保留邀请"
        safeActionOnPress={handleSafeAction}
        destructiveActionLabel="撤销邀请"
        destructiveActionOnPress={() => { void handleRevoke(); }}
        busy={busy}
      />
    </>
  );
}
