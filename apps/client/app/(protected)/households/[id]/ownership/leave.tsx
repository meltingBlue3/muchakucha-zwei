import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { sessionStateStore } from '../../../../../../src/features/auth/session-runtime';
import { ApiClient } from '@muchakucha/api-client';
import { FinalConfirmation } from '../../../../../../src/ui/household-components';
import { Banner, Heading, Stack, Text } from '../../../../../../src/ui/primitives';
import { theme } from '../../../../../../src/ui/theme';

const API_ORIGIN = process.env.EXPO_PUBLIC_API_ORIGIN ?? 'http://127.0.0.1:3000';

/**
 * D-11 owner-leave final confirmation page.
 *
 * Stage 1 — Consequence summary: displays the successor member name,
 * household name, and the irreversible consequences of leaving
 * (ownership transferred, membership deleted, access lost).
 *
 * Stage 2 — FinalConfirmation: D-10 safe-default final confirmation
 * with "取消离开" (safe, no mutation) and "确认离开家庭" (destructive)
 * in safe-first DOM order.
 *
 * D-12 recovery: on 204 success, the former owner's membership no longer
 * exists. Route to /households to let the AccessChangedPanel handle the
 * membership-loss state (freeze, clear cache, explicit routing).
 */
export default function LeaveHouseholdPage() {
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
      router.replace('/households');
    } catch (_err: unknown) {
      setError('离开家庭失败，当前家庭状态未改变。请重试。');
      setBusy(false);
      // On failure, return to consequence stage so user can re-evaluate.
      setStage('consequence');
    }
  }, [householdId, successorMembershipId, router]);

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  // ---- Stage 1: Consequence summary ----

  return (
    <>
      {error !== undefined ? (
        <View style={{ padding: theme.spacing[4] }}>
          <Banner title="离开家庭失败">{error}</Banner>
        </View>
      ) : null}
      <View
        accessibilityLabel="离开家庭确认"
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
            <Heading>离开家庭</Heading>
            <Text>
              你即将离开「{householdName}」并将所有权移交给 {successorDisplayName}。
            </Text>
            <Stack gap={2}>
              <Text variant="bodySm">
                离开后：
              </Text>
              <Text variant="bodySm">
                - {successorDisplayName} 将成为新的所有者
              </Text>
              <Text variant="bodySm">
                - 你将不再属于这个家庭
              </Text>
              <Text variant="bodySm">
                - 你将失去管理家庭和访问家庭数据的权限
              </Text>
              <Text variant="bodySm">
                - 此操作不可撤销
              </Text>
            </Stack>
          </Stack>
          <Stack gap={3}>
            <FinalConfirmation
              heading="确认离开家庭"
              body={`确认后将离开「${householdName}」，所有权将永久转移给 ${successorDisplayName}。\n\n你将不再是该家庭的成员。此操作不可撤销。`}
              safeActionLabel="取消离开"
              destructiveActionLabel="确认离开家庭"
              onSafeAction={handleCancel}
              onDestructiveAction={() => { void handleConfirm(); }}
              busy={busy}
            />
          </Stack>
        </Stack>
      </View>
    </>
  );
}
