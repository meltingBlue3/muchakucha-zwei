import type { Prisma } from '../../generated/prisma/client.js';

/**
 * A series generates its occurrences with its own labels, as it does with its
 * title. Relabelling one occurrence changes that row only. Callers validate the
 * ids against the household first; replaceLabels does so for a row.
 */
export async function setSeriesLabels(tx: Prisma.TransactionClient, ruleId: string, labelIds: string[]): Promise<void> {
  await tx.recurrenceRuleLabel.deleteMany({ where: { ruleId } });
  const unique = [...new Set(labelIds)];
  if (unique.length > 0) await tx.recurrenceRuleLabel.createMany({ data: unique.map((labelId) => ({ ruleId, labelId })) });
}

export async function seriesLabelIds(tx: Prisma.TransactionClient, ruleId: string): Promise<string[]> {
  return (await tx.recurrenceRuleLabel.findMany({ where: { ruleId }, select: { labelId: true } })).map(({ labelId }) => labelId);
}

export async function rowLabelIds(tx: Prisma.TransactionClient, kind: 'task' | 'event', id: string): Promise<string[]> {
  const rows = kind === 'task'
    ? await tx.taskLabel.findMany({ where: { taskId: id }, select: { labelId: true } })
    : await tx.eventLabel.findMany({ where: { eventId: id }, select: { labelId: true } });
  return rows.map(({ labelId }) => labelId);
}
