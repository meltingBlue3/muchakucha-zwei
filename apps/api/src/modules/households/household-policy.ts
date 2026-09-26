/**
 * Pure governance decisions shared by service logic and integration tests.
 *
 * Only the owner appoints, demotes, or removes admins. Admins may remove
 * ordinary members. Members have no governance rights.
 */

export type Role = 'OWNER' | 'ADMIN' | 'MEMBER';

export type GovernanceFailure =
  | 'TARGET_IS_OWNER'
  | 'INSUFFICIENT_ROLE'
  | 'SAME_ROLE';

/**
 * Returns a governance failure code when the requested role change is
 * forbidden, or `undefined` when the change is allowed.
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

  // Appointing or demoting an admin is reserved for the owner.
  if (actorRole !== 'OWNER') return 'INSUFFICIENT_ROLE';

  // Changing to the same role is a no-op.
  if (targetRole === newRole) return 'SAME_ROLE';

  // The owner may change any non-owner role.
  return undefined;
}

/**
 * D-10: promotion (MEMBER -> ADMIN) confirms directly;
 * demotion (ADMIN -> MEMBER) requires a dedicated confirmation page.
 */
export function isPromotion(oldRole: Role, newRole: 'ADMIN' | 'MEMBER'): boolean {
  return oldRole === 'MEMBER' && newRole === 'ADMIN';
}

export type RemovalFailure =
  | 'TARGET_IS_OWNER'
  | 'INSUFFICIENT_ROLE'
  | 'TARGET_IS_SELF';

/**
 * The owner can remove any non-owner; admins can remove ordinary
 * members only. An actor cannot remove their own membership.
 *
 * Returns a failure code when removal is forbidden, or `undefined`
 * when removal is allowed.  This function is pure — it does not
 * access the database.  Staleness and cross-household checks belong
 * in the service layer.
 */
export function removalFailure(
  targetIsOwner: boolean,
  actorRole: Role,
  targetIsActor: boolean,
  targetRole: Role,
): RemovalFailure | undefined {
  // Owner is never a valid removal target (D-09).
  if (targetIsOwner) return 'TARGET_IS_OWNER';

  // Members have no governance authority.
  if (actorRole === 'MEMBER') return 'INSUFFICIENT_ROLE';

  // Actors cannot remove themselves (use owner-leave for that flow).
  if (targetIsActor) return 'TARGET_IS_SELF';

  if (actorRole === 'ADMIN' && targetRole !== 'MEMBER') return 'INSUFFICIENT_ROLE';

  // The owner or an admin managing an ordinary member.
  return undefined;
}

export type TransferFailure =
  | 'NOT_OWNER'
  | 'SUCCESSOR_IS_OWNER';

/**
 * D-10 / D-11: only the current owner can transfer the household
 * owner pointer, and only to a different existing same-household
 * member.  Transferring to oneself is rejected because it would
 * leave the owner graph unchanged.
 *
 * Returns a failure code when transfer is forbidden, or `undefined`
 * when transfer is allowed.  This function is pure — it does not
 * access the database.  Staleness, cross-household, and composite-FK
 * checks belong in the service layer.
 */
export function transferFailure(
  actorIsOwner: boolean,
  successorIsActor: boolean,
): TransferFailure | undefined {
  // Only the current owner may transfer ownership.
  if (!actorIsOwner) return 'NOT_OWNER';

  // Transferring to oneself is a no-op — reject explicitly.
  if (successorIsActor) return 'SUCCESSOR_IS_OWNER';

  return undefined;
}

export type LeaveFailure =
  | 'NOT_OWNER'
  | 'SUCCESSOR_IS_OWNER'
  | 'LAST_MEMBER';

/**
 * D-11: only the current owner can leave the household, and must
 * select a different existing same-household member as successor.
 * The owner cannot leave if no successor exists (last member).
 *
 * Returns a failure code when leave is forbidden, or `undefined`
 * when leave is allowed.  This function is pure — it does not
 * access the database.  Staleness, cross-household, and composite-FK
 * checks belong in the service layer.
 */
export function leaveFailure(
  actorIsOwner: boolean,
  successorIsActor: boolean,
  hasOtherMembers: boolean,
): LeaveFailure | undefined {
  // Only the current owner may leave through the handoff flow.
  if (!actorIsOwner) return 'NOT_OWNER';

  // Cannot leave if no one else is in the household.
  if (!hasOtherMembers) return 'LAST_MEMBER';

  // Leaving requires a successor — self-transfer makes no sense.
  if (successorIsActor) return 'SUCCESSOR_IS_OWNER';

  return undefined;
}
