/**
 * Pure governance decisions shared by service logic and integration tests.
 *
 * Pattern analog: `apps/api/src/modules/auth/password-policy.ts`
 *
 * D-09: owner/admin can promote or demote any non-owner, including another admin;
 * admin cannot target owner.  Members have no governance rights.
 */

export type Role = 'OWNER' | 'ADMIN' | 'MEMBER';

export type GovernanceFailure =
  | 'TARGET_IS_OWNER'
  | 'INSUFFICIENT_ROLE'
  | 'SAME_ROLE';

/**
 * Returns a governance failure code when the requested role change is
 * forbidden by D-09, or `undefined` when the change is allowed.
 *
 * This function is intentionally pure — it does not access the database
 * and cannot detect staleness or cross-household conditions.  Those
 * checks belong in the service layer.
 */
export function roleChangeFailure(
  targetIsOwner: boolean,
  actorRole: Role,
  targetRole: Role,
  newRole: 'ADMIN' | 'MEMBER',
): GovernanceFailure | undefined {
  // Owner is untouchable — no actor may promote or demote the owner.
  if (targetIsOwner) return 'TARGET_IS_OWNER';

  // Members have no governance authority.
  if (actorRole === 'MEMBER') return 'INSUFFICIENT_ROLE';

  // Changing to the same role is a no-op.
  if (targetRole === newRole) return 'SAME_ROLE';

  // Both OWNER and ADMIN may govern any non-owner (per D-09).
  return undefined;
}

/**
 * D-10: promotion (MEMBER -> ADMIN) confirms directly;
 * demotion (ADMIN -> MEMBER) requires a dedicated confirmation page.
 */
export function isPromotion(oldRole: Role, newRole: 'ADMIN' | 'MEMBER'): boolean {
  return oldRole === 'MEMBER' && newRole === 'ADMIN';
}
