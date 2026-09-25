/**
 * Mirrors `requireAdmin` in `apps/api/src/modules/labels/labels.service.ts`:
 * only an owner or admin may create, rename, recolour, or delete a label.
 *
 * The client cannot import the server rule, so this is a deliberate second
 * copy kept beside the feature it gates — the same arrangement as
 * `member-governance.tsx` against `household-policy.ts`. A member offered
 * these entry points can only ever receive `403 FORBIDDEN`.
 *
 * An unresolved role denies management: the household may still be loading or
 * may have been left, and showing an action that cannot succeed is the failure
 * this function exists to prevent.
 */
export function canManageLabels(role: 'OWNER' | 'ADMIN' | 'MEMBER' | undefined): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}
