import type { ApiClient, ChangeMemberRoleDto, GetHouseholdMemberDto } from '@muchakucha/api-client';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

/**
 * Minimal API surface required by member governance operations.
 * Testable with a fake client supplying only the required methods.
 */
export type GovernanceApi = Pick<ApiClient, 'changeMemberRole' | 'removeMember' | 'transferOwnership' | 'leaveHousehold'>;

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

export interface RemoveMemberParams {
  accessToken: string;
  householdId: string;
  targetMembershipId: string;
}

/**
 * Calls the server-authoritative member-removal endpoint.
 * Returns the updated household projection on success.
 * Throws ApiClientError on failure — callers handle error display.
 */
export async function removeMemberApi(
  apiClient: GovernanceApi,
  params: RemoveMemberParams,
): Promise<{ members: GetHouseholdMemberDto[] }> {
  return apiClient.removeMember(
    params.accessToken,
    params.householdId,
    params.targetMembershipId,
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
  if (targetIsOwner || targetRole === 'OWNER') return false;
  if (actorIsOwner !== (actorRole === 'OWNER')) return false;
  // Member cannot govern anyone.
  if (actorRole === 'MEMBER') return false;
  // Cannot govern yourself.
  if (targetIsSelf) return false;
  // Both OWNER and ADMIN can govern any non-owner.
  return actorRole === 'OWNER' || actorRole === 'ADMIN';
}

/**
 * D-09: returns whether the current actor can remove the given member.
 * Owner/admin can remove any non-owner (including other admins).
 * Owner is never a valid removal target. Cannot remove yourself.
 */
export function canRemove(
  actorRole: 'OWNER' | 'ADMIN' | 'MEMBER',
  targetRole: 'OWNER' | 'ADMIN' | 'MEMBER',
  targetIsOwner: boolean,
  targetIsSelf: boolean,
): boolean {
  if (targetIsOwner || targetRole === 'OWNER') return false;
  if (targetIsSelf) return false;
  if (actorRole === 'MEMBER') return false;
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
 * D-10 / D-11: returns whether the current actor can transfer ownership
 * to the given successor. Only the current owner can initiate a transfer,
 * and only to a different same-household member (not themselves).
 */
export function canTransferOwnership(
  actorRole: 'OWNER' | 'ADMIN' | 'MEMBER',
  actorIsOwner: boolean,
  successorIsSelf: boolean,
): boolean {
  // Only the owner can transfer.
  if (!actorIsOwner || actorRole !== 'OWNER') return false;
  // Cannot transfer to self.
  if (successorIsSelf) return false;
  return true;
}

export interface TransferOwnershipParams {
  accessToken: string;
  householdId: string;
  successorMembershipId: string;
}

/**
 * Calls the server-authoritative ownership transfer endpoint.
 * Returns the updated household projection on success.
 * Throws ApiClientError on failure — callers handle error display.
 */
export async function transferOwnershipApi(
  apiClient: GovernanceApi,
  params: TransferOwnershipParams,
): Promise<{ members: GetHouseholdMemberDto[] }> {
  return apiClient.transferOwnership(
    params.accessToken,
    params.householdId,
    { successorMembershipId: params.successorMembershipId },
  );
}

/**
 * D-11: returns whether the current actor can leave the household.
 * Only the current owner can initiate a leave, and only if other
 * members exist in the household (policy check on member count
 * happens server-side, but client guards for UI).
 */
export function canLeave(
  actorRole: 'OWNER' | 'ADMIN' | 'MEMBER',
  actorIsOwner: boolean,
  otherMemberCount: number,
): boolean {
  // Only the owner can leave through the handoff flow.
  if (!actorIsOwner || actorRole !== 'OWNER') return false;
  // Must have at least one other member to select as successor.
  if (otherMemberCount < 1) return false;
  return true;
}

export interface LeaveHouseholdParams {
  accessToken: string;
  householdId: string;
  successorMembershipId: string;
}

/**
 * Calls the server-authoritative owner-leave endpoint.
 * Returns void on 204 success — the caller's membership no longer exists.
 * Throws ApiClientError on failure — callers handle error display.
 */
export async function leaveHouseholdApi(
  apiClient: GovernanceApi,
  params: LeaveHouseholdParams,
): Promise<void> {
  return apiClient.leaveHousehold(
    params.accessToken,
    params.householdId,
    { successorMembershipId: params.successorMembershipId },
  );
}

/**
 * Hook that provides governance action callbacks for the member list.
 *
 * Promotion (MEMBER->ADMIN) navigates to the dedicated confirmation page.
 * Demotion (ADMIN->MEMBER) navigates to the same page, which branches on
 * the passed-through current role per D-10 safe-action-first contract.
 * Removal navigates to the dedicated D-10 consequence confirmation page.
 * Transfer navigates to the D-10 ownership transfer page.
 * Leave navigates to the D-11 owner-leave page.
 *
 * All destination pages read display name / role / household name from
 * query params (falling back to generic text if absent), so callers must
 * pass the target member's current data through.
 */
export interface UseMemberGovernanceResult {
  promote: ((membershipId: string, displayName: string) => void) | undefined;
  demote: ((membershipId: string, displayName: string) => void) | undefined;
  remove: ((membershipId: string, displayName: string, targetRole: 'OWNER' | 'ADMIN' | 'MEMBER') => void) | undefined;
  /** Only available to the current owner — an admin cannot transfer ownership. */
  transfer: ((successorMembershipId: string, successorDisplayName: string) => void) | undefined;
  /** Navigate to the owner-leave confirmation page. Only available for the current owner. */
  leave: ((successorMembershipId: string, successorDisplayName: string) => void) | undefined;
  /** Whether any governance mutation is pending. */
  isBusy: boolean;
}

export function useMemberGovernance(
  householdId: string,
  actorRole: 'OWNER' | 'ADMIN' | 'MEMBER',
  householdName: string,
): UseMemberGovernanceResult {
  const router = useRouter();

  const gotoRole = useCallback(
    (membershipId: string, displayName: string, currentRole: 'ADMIN' | 'MEMBER') => {
      void router.push(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (`/households/${encodeURIComponent(householdId)}/members/${encodeURIComponent(membershipId)}/role` +
          `?displayName=${encodeURIComponent(displayName)}&role=${encodeURIComponent(currentRole)}`) as any,
      );
    },
    [router, householdId],
  );

  const promote = useCallback(
    (membershipId: string, displayName: string) => gotoRole(membershipId, displayName, 'MEMBER'),
    [gotoRole],
  );

  const demote = useCallback(
    (membershipId: string, displayName: string) => gotoRole(membershipId, displayName, 'ADMIN'),
    [gotoRole],
  );

  const remove = useCallback(
    (membershipId: string, displayName: string, targetRole: 'OWNER' | 'ADMIN' | 'MEMBER') => {
      void router.push(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (`/households/${encodeURIComponent(householdId)}/members/${encodeURIComponent(membershipId)}/remove` +
          `?displayName=${encodeURIComponent(displayName)}&role=${encodeURIComponent(targetRole)}`) as any,
      );
    },
    [router, householdId],
  );

  const transfer = useCallback(
    (successorMembershipId: string, successorDisplayName: string) => {
      void router.push(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (`/households/${encodeURIComponent(householdId)}/ownership/transfer?successorMembershipId=${encodeURIComponent(successorMembershipId)}` +
          `&successorDisplayName=${encodeURIComponent(successorDisplayName)}&householdName=${encodeURIComponent(householdName)}`) as any,
      );
    },
    [router, householdId, householdName],
  );

  const leave = useCallback(
    (successorMembershipId: string, successorDisplayName: string) => {
      void router.push(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (`/households/${encodeURIComponent(householdId)}/ownership/leave?successorMembershipId=${encodeURIComponent(successorMembershipId)}` +
          `&successorDisplayName=${encodeURIComponent(successorDisplayName)}&householdName=${encodeURIComponent(householdName)}`) as any,
      );
    },
    [router, householdId, householdName],
  );

  // MEMBER cannot govern anyone; only the OWNER can transfer or leave-with-handoff.
  const isMember = actorRole === 'MEMBER';
  const isOwner = actorRole === 'OWNER';

  return {
    promote: isMember ? undefined : promote,
    demote: isMember ? undefined : demote,
    remove: isMember ? undefined : remove,
    transfer: isOwner ? transfer : undefined,
    leave: isOwner ? leave : undefined,
    isBusy: false,
  };
}
