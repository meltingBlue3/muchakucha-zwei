import { RECURRENCE_LOCK_NAMESPACE } from '../recurrence/recurrence-lock.js';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';

type Kind = 'note' | 'task' | 'event';
const tables = { note: 'notes', task: 'tasks', event: 'events' } as const;
export function assertEditVersion(actual: Date, expected: string | undefined, field = 'expectedUpdatedAt'): void {
  if (typeof expected !== 'string' || !Number.isFinite(new Date(expected).getTime())) {
    throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'An edit version is required.', details: [{ field, codes: ['required_version'] }] });
  }
  if (actual.getTime() !== new Date(expected).getTime()) {
    throw new ConflictException({ code: 'EDIT_CONFLICT', message: 'Content has changed. Review the latest version before saving.' });
  }
}
interface EditPrecondition { expectedUpdatedAt: string; expectedRuleUpdatedAt?: string }
export const nextEditTime = (current: Date): Date => new Date(Math.max(Date.now(), current.getTime() + 1));

export async function lockRule(tx: Prisma.TransactionClient, householdId: string, id: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(${RECURRENCE_LOCK_NAMESPACE}, hashtext(${id}))::text`;
  const rows = await tx.$queryRaw<Array<{ updatedAt: Date }>>`SELECT updated_at AS "updatedAt" FROM recurrence_rules WHERE id = ${id}::uuid AND household_id = ${householdId}::uuid FOR UPDATE`;
  if (!rows[0]) throw new NotFoundException({ code: 'RECURRENCE_RULE_NOT_FOUND', message: 'Recurrence rule not found.' });
  return rows[0].updatedAt;
}

// All edit paths lock the series before the occurrence, so a split cannot race a save.
export async function lockContent(tx: Prisma.TransactionClient, kind: Kind, householdId: string, id: string, edit?: EditPrecondition) {
  const table = Prisma.raw(tables[kind]);
  const relation = kind === 'note' ? Prisma.sql`NULL` : Prisma.sql`recurrence_rule_id`;
  const scope = Prisma.sql`id = ${id}::uuid AND household_id = ${householdId}::uuid`;
  const before = await tx.$queryRaw<Array<{ ruleId: string | null }>>(Prisma.sql`SELECT ${relation} AS "ruleId" FROM ${table} WHERE ${scope}`);
  if (!before[0]) throw new NotFoundException({ code: `${kind.toUpperCase()}_NOT_FOUND`, message: 'Content not found.' });
  const ruleId = before[0].ruleId;
  const ruleTime = ruleId === null ? null : await lockRule(tx, householdId, ruleId);
  const rows = await tx.$queryRaw<Array<{ updatedAt: Date }>>(Prisma.sql`SELECT updated_at AS "updatedAt" FROM ${table} WHERE ${scope} FOR UPDATE`);
  if (!rows[0]) throw new NotFoundException({ code: `${kind.toUpperCase()}_NOT_FOUND`, message: 'Content not found.' });
  if (edit) {
    assertEditVersion(rows[0].updatedAt, edit.expectedUpdatedAt);
    if (ruleTime) assertEditVersion(ruleTime, edit.expectedRuleUpdatedAt, 'expectedRuleUpdatedAt');
  }
  if (ruleId !== null && ruleTime !== null) {
    await tx.recurrenceRule.update({ where: { id: ruleId }, data: { updatedAt: nextEditTime(ruleTime) } });
  }
  return nextEditTime(rows[0].updatedAt);
}

export async function replaceLabels(tx: Prisma.TransactionClient, kind: 'task' | 'event', householdId: string, id: string, ids?: string[]) {
  if (ids === undefined) return;
  const labels = await tx.label.count({ where: { id: { in: ids }, householdId } });
  if (labels !== new Set(ids).size) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Invalid labels.', details: [{ field: 'labelIds', codes: ['invalid'] }] });
  if (kind === 'task') {
    await tx.taskLabel.deleteMany({ where: { taskId: id } });
    await tx.taskLabel.createMany({ data: [...new Set(ids)].map(labelId => ({ taskId: id, labelId })) });
  } else {
    await tx.eventLabel.deleteMany({ where: { eventId: id } });
    await tx.eventLabel.createMany({ data: [...new Set(ids)].map(labelId => ({ eventId: id, labelId })) });
  }
}
