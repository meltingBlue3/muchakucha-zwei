import type { Prisma } from '../../generated/prisma/client.js';
import type { ReminderChoiceDto } from '../reminders/dto/reminder.dto.js';

type Kind = 'task' | 'event';

/** The task or event row a personal reminder is read for or written to. */
export interface ReminderItem {
  id: string;
  recurrenceRuleId: string | null;
}

export const DEFAULT_REMINDER: ReminderChoiceDto = { mode: 'default', minutesBefore: null, alarm: null };

interface StoredChoice {
  mode: string;
  minutesBefore: number | null;
  alarm: boolean | null;
}

export function choiceFromRow(row: StoredChoice): ReminderChoiceDto {
  if (row.mode === 'before') return { mode: 'before', minutesBefore: row.minutesBefore ?? 0, alarm: row.alarm };
  return { mode: row.mode === 'off' ? 'off' : 'default', minutesBefore: null, alarm: row.alarm };
}

/** The row a choice is stored as: no minutes outside `before`, nothing to ring when off. */
function rowFromChoice(choice: ReminderChoiceDto): StoredChoice {
  if (choice.mode === 'off') return { mode: 'off', minutesBefore: null, alarm: null };
  return { mode: choice.mode, minutesBefore: choice.mode === 'before' ? choice.minutesBefore ?? 0 : null, alarm: choice.alarm ?? null };
}

// A recurring occurrence's reminder lives on its series: occurrences are
// generated ahead of time, and a choice made on one must reach the rows that
// do not exist yet.
function target(kind: Kind, item: ReminderItem): { taskId: string } | { eventId: string } | { recurrenceRuleId: string } {
  if (item.recurrenceRuleId !== null) return { recurrenceRuleId: item.recurrenceRuleId };
  return kind === 'task' ? { taskId: item.id } : { eventId: item.id };
}

export async function readReminderChoices(
  db: Prisma.TransactionClient,
  userId: string,
  kind: Kind,
  items: ReminderItem[],
): Promise<Map<string, ReminderChoiceDto>> {
  const choices = new Map<string, ReminderChoiceDto>();
  if (items.length === 0) return choices;
  const ids = items.filter(item => item.recurrenceRuleId === null).map(item => item.id);
  const ruleIds = [...new Set(items.flatMap(item => item.recurrenceRuleId === null ? [] : [item.recurrenceRuleId]))];
  const overrides = await db.reminderOverride.findMany({
    where: {
      userId,
      OR: [
        ...(ids.length === 0 ? [] : [kind === 'task' ? { taskId: { in: ids } } : { eventId: { in: ids } }]),
        ...(ruleIds.length === 0 ? [] : [{ recurrenceRuleId: { in: ruleIds } }]),
      ],
    },
  });
  const byTarget = new Map(overrides.map(override => [override.recurrenceRuleId ?? override.taskId ?? override.eventId, override]));
  for (const item of items) {
    const row = byTarget.get(item.recurrenceRuleId ?? item.id);
    choices.set(item.id, row === undefined ? DEFAULT_REMINDER : choiceFromRow(row));
  }
  return choices;
}

export async function readReminderChoice(db: Prisma.TransactionClient, userId: string, kind: Kind, item: ReminderItem): Promise<ReminderChoiceDto> {
  return (await readReminderChoices(db, userId, kind, [item])).get(item.id) ?? DEFAULT_REMINDER;
}

export async function writeReminderChoice(
  db: Prisma.TransactionClient,
  userId: string,
  kind: Kind,
  item: ReminderItem,
  choice: ReminderChoiceDto,
): Promise<ReminderChoiceDto> {
  const where = { userId, ...target(kind, item) };
  const row = rowFromChoice(choice);
  if (row.mode === 'default' && row.alarm === null) {
    await db.reminderOverride.deleteMany({ where });
    return DEFAULT_REMINDER;
  }
  await db.reminderOverride.upsert({ where: uniqueTarget(where), create: { ...where, ...row }, update: row });
  return choiceFromRow(row);
}

function uniqueTarget(where: { userId: string } & ReturnType<typeof target>): Prisma.ReminderOverrideWhereUniqueInput {
  if ('recurrenceRuleId' in where) return { userId_recurrenceRuleId: { userId: where.userId, recurrenceRuleId: where.recurrenceRuleId } };
  if ('taskId' in where) return { userId_taskId: { userId: where.userId, taskId: where.taskId } };
  return { userId_eventId: { userId: where.userId, eventId: where.eventId } };
}

/** A series split hands every member's reminder for the old series to its successor. */
export async function copyRuleReminders(tx: Prisma.TransactionClient, fromRuleId: string, toRuleId: string): Promise<void> {
  const overrides = await tx.reminderOverride.findMany({ where: { recurrenceRuleId: fromRuleId } });
  if (overrides.length === 0) return;
  await tx.reminderOverride.createMany({
    data: overrides.map(({ userId, mode, minutesBefore, alarm }) => ({ userId, recurrenceRuleId: toRuleId, mode, minutesBefore, alarm })),
    skipDuplicates: true,
  });
}
