import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { sessionTransport } from '../../../../../src/features/auth/session-runtime';
import { sessionStateStore } from '../../../../../src/features/auth/session-runtime';
import { ApiClient } from '@muchakucha/api-client';
import { FinalConfirmation } from '../../../../../src/ui/household-components';
import { Banner, Button, Heading, Spinner, Stack, Text } from '../../../../../src/ui/primitives';
import { theme } from '../../../../../src/ui/theme';

const API_ORIGIN = process.env.EXPO_PUBLIC_API_ORIGIN ?? 'http://localhost:3000';

/**
 * D-10 / D-11 ownership transfer final confirmation page.
 *
 * Stage 1 — Consequence summary: displays the successor member name,
 * household name, and the irreversible consequences of the transfer
 * (former owner becomes MEMBER, ownership pointer moves).
 *
 * Stage 2 — FinalConfirmation: D-10 safe-default final confirmation
 * with "取消转移" (safe, no mutation) and "确认转移所有权" (destructive)
 * in safe-first DOM order, with a focus trap on the safe action.
 */
export default function TransferOwnershipPage() {
  const router = useRouter();
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

  // Check auth state — redirect if not authenticated.
  const sessionState = sessionStateStore.get();
  if (sessionState.kind !== 'authenticated') {
    router.replace('/login');
    return null;
  }

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
      router.back();
    } catch (_err: unknown) {
      setError('所有权转移失败，当前家庭状态未改变。请重试。');
      setBusy(false);
      // On failure, return to consequence stage so user can re-evaluate.
      setStage('consequence');
    }
  }, [householdId, successorMembershipId, router]);

  const handleContinue = useCallback(() => {
    setError(undefined);
    setStage('final');
  }, []);

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  // ---- Stage 1: Consequence summary ----

  if (stage === 'consequence') {
    return (
      <>
        {error !== undefined ? (
          <View style={{ padding: theme.spacing[4] }}>
            <Banner title="所有权转移失败">{error}</Banner>
          </View>
        ) : null}
        <View
          accessibilityLabel="所有权转移确认"
          accessibilityLiveRegion="assertive"
          accessibilityRole="alert"
          style={{
            alignItems: 'center',
            flex: 1,
            justifyContent: 'center',
            padding: theme.spacing[6],
          }}
        >
          <Stack gap={6} style={{ alignItems: 'stretch', maxWidth: 480, width: '100%' }}>
            <Stack gap={4}>
              <Heading>转移家庭所有权</Heading>
              <Text>
                你即将把「{householdName}」的所有权转移给 {successorDisplayName}。
              </Text>
              <Stack gap={2}>
                <Text variant="bodySm">
                  转移完成后：
                </Text>
                <Text variant="bodySm">
                  - {successorDisplayName} 将成为新的所有者
                </Text>
                <Text variant="bodySm">
                  - 你的角色将变为普通成员（MEMBER）
                </Text>
                <Text variant="bodySm">
                  - 你将失去管理家庭和更改设置的权限
                </Text>
                <Text variant="bodySm">
                  - 此操作不可撤销
                </Text>
              </Stack>
            </Stack>
            <Stack gap={3}>
              <Button label="取消转移" onPress={handleCancel} />
              <Button label="继续" onPress={handleContinue} />
            </Stack>
          </Stack>
        </View>
      </>
    );
  }

  // ---- Stage 2: Final confirmation (safe-default) ----

  return (
    <>
      {error !== undefined ? (
        <View style={{ padding: theme.spacing[4] }}>
          <Banner title="所有权转移失败">{error}</Banner>
        </View>
      ) : null}
      {busy ? (
        <View
          accessibilityLabel="正在转移所有权"
          style={{
            alignItems: 'center',
            flex: 1,
            justifyContent: 'center',
            padding: theme.spacing[6],
          }}
        >
          <Spinner label="正在转移所有权，请稍候……" />
        </View>
      ) : (
        <FinalConfirmation
          heading="最终确认：转移所有权"
          body={`确认后将「${householdName}」的所有权永久转移给 ${successorDisplayName}。\n\n你的角色将变更为普通成员。此操作不可撤销。`}
          safeActionLabel="取消转移"
          destructiveActionLabel="确认转移所有权"
          onSafeAction={handleCancel}
          onDestructiveAction={() => { void handleConfirm(); }}
          busy={busy}
        />
      )}
    </>
  );
}
