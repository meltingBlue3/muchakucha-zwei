import type { Prisma } from '../../generated/prisma/client.js';

/**
 * The household list's label order: by name, then the starters that keep
 * their default name (they store none) in a fixed order. The calendar colours
 * an item by its first label, so the order must not depend on how they were
 * chosen or on which rows the database happens to return first.
 */
export const labelOrder: Prisma.LabelOrderByWithRelationInput[] = [{ name: { sort: 'asc', nulls: 'last' } }, { systemKey: 'asc' }];

/** An item's labels in the household list's order. */
export const labelsByName = { include: { label: true } as const, orderBy: labelOrder.map((label) => ({ label })) };
