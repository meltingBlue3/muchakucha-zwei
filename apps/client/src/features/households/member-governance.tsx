import type { ApiClient, ChangeMemberRoleDto, GetHouseholdMemberDto } from '@muchakucha/api-client';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

/**
 * Minimal API surface required by member governance operations.
 * Testable with a fake client supplying only `changeMemberRole`.
 */
export type GovernanceApi = Pick<ApiClient, 'changeMemberRole'>;

export interface ChangeRoleParams {
  accessToken: string;
  householdId: string;
  targetMembershipId: string;
  newRole: ChangeMemberRoleDto['role'];
}

/**
 * Calls the server-authoritative role-change endpoint.
 * Returns the updated household projection on success.
 * Throws ApiClientError on failure — callers handle error display.
 */
export async function changeMemberRole(
  apiClient: GovernanceApi,
  params: ChangeRoleParams,
): Promise<{ members: GetHouseholdMemberDto[] }> {
  return apiClient.changeMemberRole(
    params.accessToken,
    params.householdId,
    params.targetMembershipId,
    { role: params.newRole },
  );
}

/**
 * D-10: determines whether this role change is a promotion (MEMBER->ADMIN)
 * or a demotion (ADMIN->MEMBER) for routing purposes.
 */
export function isPromotion(oldRole: 'OWNER' | 'ADMIN' | 'MEMBER', newRole: 'ADMIN' | 'MEMBER'): boolean {
  return oldRole === 'MEMBER' && newRole === 'ADMIN';
}

/**
 * D-09: returns whether the current actor can govern the given member.
 */
export function canGovern(
  actorRole: 'OWNER' | 'ADMIN' | 'MEMBER',
  actorIsOwner: boolean,
  targetRole: 'OWNER' | 'ADMIN' | 'MEMBER',
  targetIsOwner: boolean,
  targetIsSelf: boolean,
): boolean {
  // Owner is untouchable for role changes.
  if (targetIsOwner) return false;
  // Member cannot govern anyone.
  if (actorRole === 'MEMBER') return false;
  // Cannot govern yourself.
  if (targetIsSelf) return false;
  // Both OWNER and ADMIN can govern any non-owner.
  return actorRole === 'OWNER' || actorRole === 'ADMIN';
}

export type GovernanceAction = 'none' | 'promote' | 'demote';

/**
 * Computes which governance action (if any) is available for this member
 * from the actor's perspective.
 */
export function governanceAction(
  actorRole: 'OWNER' | 'ADMIN' | 'MEMBER',
  actorIsOwner: boolean,
  targetRole: 'OWNER' | 'ADMIN' | 'MEMBER',
  targetIsOwner: boolean,
  targetIsSelf: boolean,
): GovernanceAction {
  if (!canGovern(actorRole, actorIsOwner, targetRole, targetIsOwner, targetIsSelf)) {
    return 'none';
  }
  if (targetRole === 'MEMBER') return 'promote';
  if (targetRole === 'ADMIN') return 'demote';
  return 'none';
}

/**
 * Hook that provides governance action callbacks for the member list.
 *
 * Promotion (MEMBER->ADMIN) returns a direct API call handler.
 * Demotion (ADMIN->MEMBER) navigates to the dedicated confirmation page
 * per D-10 safe-action-first contract.
 */
export interface UseMemberGovernanceResult {
  promote: ((membershipId: string) => void) | undefined;
  demote: ((membershipId: string) => void) | undefined;
  /** Whether any governance mutation is pending. */
  isBusy: boolean;
}

export function useMemberGovernance(
  householdId: string,
  actorRole: 'OWNER' | 'ADMIN' | 'MEMBER',
): UseMemberGovernanceResult {
  const router = useRouter();

  const promote = useCallback(
    (membershipId: string) => {
      void router.push(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        `/households/${encodeURIComponent(householdId)}/members/${encodeURIComponent(membershipId)}/role` as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      );
    },
    [router, householdId],
  );

  const demote = useCallback(
    (membershipId: string) => {
      void router.push(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        `/households/${encodeURIComponent(householdId)}/members/${encodeURIComponent(membershipId)}/role` as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      );
    },
    [router, householdId],
  );

  // When actor role is MEMBER, return undefined callbacks.
  if (actorRole === 'MEMBER') {
    return { promote: undefined, demote: undefined, isBusy: false };
  }

  return { promote, demote, isBusy: false };
}
