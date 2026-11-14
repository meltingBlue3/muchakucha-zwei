import { rememberRouteTrigger } from '../../platform/overlays/route-trigger';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

/**
 * Only the owner can appoint or demote admins.
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
  return actorRole === 'OWNER';
}

/**
 * Returns whether the current actor can remove the given member.
 * The owner can remove admins; admins can remove ordinary members only.
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
  return actorRole === 'OWNER' || (actorRole === 'ADMIN' && targetRole === 'MEMBER');
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
 * Returns whether the current actor can transfer ownership
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

/**
 * Hook that provides governance action callbacks for the member list.
 *
 * Promotion (MEMBER->ADMIN) navigates to the dedicated confirmation page.
 * Demotion (ADMIN->MEMBER) navigates to the same page, which branches on
 * the passed-through current role, safe action first.
 * Removal navigates to the dedicated consequence confirmation page.
 * Transfer navigates to the ownership transfer page.
 * Leave navigates to the owner-leave page.
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
}

export function useMemberGovernance(
  householdId: string,
  actorRole: 'OWNER' | 'ADMIN' | 'MEMBER',
  householdName: string,
): UseMemberGovernanceResult {
  const router = useRouter();

  const gotoRole = useCallback(
    (membershipId: string, displayName: string, currentRole: 'ADMIN' | 'MEMBER') => {
      rememberRouteTrigger();
      void router.push(
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
      rememberRouteTrigger();
      void router.push(
        (`/households/${encodeURIComponent(householdId)}/members/${encodeURIComponent(membershipId)}/remove` +
          `?displayName=${encodeURIComponent(displayName)}&role=${encodeURIComponent(targetRole)}`) as any,
      );
    },
    [router, householdId],
  );

  const transfer = useCallback(
    (successorMembershipId: string, successorDisplayName: string) => {
      rememberRouteTrigger();
      void router.push(
        (`/households/${encodeURIComponent(householdId)}/ownership/transfer?successorMembershipId=${encodeURIComponent(successorMembershipId)}` +
          `&successorDisplayName=${encodeURIComponent(successorDisplayName)}&householdName=${encodeURIComponent(householdName)}`) as any,
      );
    },
    [router, householdId, householdName],
  );

  const leave = useCallback(
    (successorMembershipId: string, successorDisplayName: string) => {
      rememberRouteTrigger();
      void router.push(
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
    promote: isOwner ? promote : undefined,
    demote: isOwner ? demote : undefined,
    remove: isMember ? undefined : remove,
    transfer: isOwner ? transfer : undefined,
    leave: isOwner ? leave : undefined,
  };
}
