/**
 * An item's labels in the household list's order. The calendar colours an
 * item by its first label, so the order must not depend on how they were chosen.
 */
export const labelsByName = { include: { label: true }, orderBy: { label: { name: 'asc' } } } as const;
