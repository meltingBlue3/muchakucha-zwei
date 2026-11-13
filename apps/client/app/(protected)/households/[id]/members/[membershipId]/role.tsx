import { useTranslation } from '../../../../../../src/i18n';
import { HouseholdActionWindow, useHouseholdActionClose } from '../../../../../../src/features/households/household-action-window';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { sessionStateStore } from '../../../../../../src/features/auth/session-runtime';
import { ApiClient } from '@muchakucha/api-client';
import { Banner, ConfirmActions, Stack, Text } from '../../../../../../src/ui/primitives';

const API_ORIGIN = process.env.EXPO_PUBLIC_API_ORIGIN ?? 'http://localhost:3000';

/**
 * D-09 / D-10 role change confirmation page.
 *
 * - Promotion (MEMBER->ADMIN): direct confirmation with non-destructive button.
 * - Demotion (ADMIN->MEMBER): Window confirmation with safe-action-first ordering.
 */
export default function ChangeMemberRolePage() {
  const { t } = useTranslation('households');
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
  const displayName = params.displayName ?? t('governance.memberFallback');
  const currentRole = (params.role ?? 'MEMBER') as 'ADMIN' | 'MEMBER';

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'governance.roleError' | undefined>(undefined);

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
      setError('governance.roleError');
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

  return <HouseholdActionWindow title={isPromotion ? t('governance.promoteTitle', { displayName }) : t('governance.demoteTitle', { displayName })} busy={busy} onClose={handleSafeAction} exitAllowed={exitAllowed}>
    <Stack gap={4}>
      {error ? <Banner title={t('governance.roleFailed')}>{t(error)}</Banner> : null}
      <Text>{isPromotion ? t('governance.promoteDetail') : t('governance.demoteDetail')}</Text>
      {/* A demotion takes rights away, so it reads as destructive; a promotion does not. */}
      <ConfirmActions cancelLabel={isPromotion ? t('governance.keepMember') : t('governance.keepAdmin')} confirmLabel={isPromotion ? t('governance.confirmPromote') : t('demote')} destructive={!isPromotion} busy={busy} onCancel={handleSafeAction} onConfirm={() => void handleRoleChange()} />
    </Stack>
  </HouseholdActionWindow>;
}
