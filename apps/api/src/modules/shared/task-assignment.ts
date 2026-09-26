import type { Prisma } from '../../generated/prisma/client.js';
import { lockRule, nextEditTime } from './edit-version.js';

// Assignment writers enter before taking rule/occurrence locks. The no-op
// write also invalidates a waiting Serializable membership-removal snapshot,
// so its retry sees tasks created while it was waiting for the household.
export async function lockTaskAssignments(tx: Prisma.TransactionClient, householdId: string): Promise<void> {
  await tx.$executeRaw`UPDATE households SET name = name WHERE id = ${householdId}::uuid`;
}

// Caller holds the household lock; remove from every instance (including the
// earliest seed used by materialization), and invalidate open editor versions.
export async function removeMemberAssignments(tx: Prisma.TransactionClient, householdId: string, userId: string): Promise<void> {
  const series = await tx.task.findMany({
    where: { householdId, assignees: { some: { userId } }, recurrenceRuleId: { not: null } },
    select: { recurrenceRuleId: true }, distinct: ['recurrenceRuleId'],
    orderBy: { recurrenceRuleId: 'asc' },
  });
  for (const { recurrenceRuleId } of series) {
    if (recurrenceRuleId === null) continue;
    const previous = await lockRule(tx, householdId, recurrenceRuleId);
    await tx.recurrenceRule.update({ where: { id: recurrenceRuleId }, data: { updatedAt: nextEditTime(previous) } });
  }
  // Bulk update avoids one transaction round trip per generated occurrence.
  await tx.$executeRaw`
    UPDATE tasks SET updated_at = GREATEST(clock_timestamp(), updated_at + INTERVAL '1 millisecond')
    WHERE household_id = ${householdId}::uuid
      AND EXISTS (SELECT 1 FROM task_assignees WHERE task_id = tasks.id AND user_id = ${userId}::uuid)
  `;
  await tx.taskAssignee.deleteMany({ where: { userId, task: { householdId } } });
}
