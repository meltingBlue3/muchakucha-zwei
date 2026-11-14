/** Whether a Prisma write failed on a unique constraint (P2002), as when a concurrent request inserted the same key first. */
export function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
