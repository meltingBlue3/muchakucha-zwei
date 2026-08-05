import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { sessionStateStore } from '../../../../../../src/features/auth/session-runtime';
import { ApiClient } from '@muchakucha/api-client';
import { ConfirmationPage } from '../../../../../../src/ui/household-components';
import { Banner, Button, Heading, Stack, Text } from '../../../../../../src/ui/primitives';
import { theme } from '../../../../../../src/ui/theme';

const API_ORIGIN = process.env.EXPO_PUBLIC_API_ORIGIN ?? 'http://localhost:3000';

/**
 * D-09 / D-10 role change confirmation page.
 *
 * - Promotion (MEMBER->ADMIN): direct confirmation with non-destructive button.
 * - Demotion (ADMIN->MEMBER): ConfirmationPage with safe-action-first ordering.
 */
export default function ChangeMemberRolePage() {
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
  const currentRole = (params.role ?? 'MEMBER') as 'ADMIN' | 'MEMBER';

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  // Check auth state — redirect if not authenticated.
  const sessionState = sessionStateStore.get();
  if (sessionState.kind !== 'authenticated') {
    router.replace('/login');
    return null;
  }

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

      router.back();
    } catch (_err: unknown) {
      setError('没有完成，当前家庭状态未改变。请重试。');
      setBusy(false);
    }
  }, [householdId, membershipId, newRole, router]);

  const handleSafeAction = useCallback(() => {
    router.back();
  }, [router]);

  // ---- Promotion: direct confirmation (no destructive styling) ----
  if (isPromotion) {
    return (
      <View
        accessibilityLabel={`提升${displayName}为管理员`}
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
          {error !== undefined ? (
            <Banner title="角色变更失败">{error}</Banner>
          ) : null}
          <Stack gap={4}>
            <Heading>将 {displayName} 提升为管理员？</Heading>
            <Text>
              对方将获得邀请和管理成员的权限。
            </Text>
          </Stack>
          <Stack gap={3}>
            <Button
              disabled={busy}
              label="保留成员权限"
              onPress={handleSafeAction}
            />
            <Button
              disabled={busy}
              label="确认提升为管理员"
              loading={busy}
              onPress={() => { void handleRoleChange(); }}
            />
          </Stack>
        </Stack>
      </View>
    );
  }

  // ---- Demotion: ConfirmationPage with safe-action-first (D-10) ----
  return (
    <>
      {error !== undefined ? (
        <View style={{ padding: theme.spacing[4] }}>
          <Banner title="角色变更失败">{error}</Banner>
        </View>
      ) : null}
      <ConfirmationPage
        heading={`将 ${displayName} 改为成员？`}
        body="对方将不能再邀请或管理成员。"
        safeActionLabel="保留管理员权限"
        safeActionOnPress={handleSafeAction}
        destructiveActionLabel="降级为成员"
        destructiveActionOnPress={() => { void handleRoleChange(); }}
        busy={busy}
      />
    </>
  );
}
