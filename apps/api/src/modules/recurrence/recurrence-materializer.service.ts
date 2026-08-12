import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { addDays, formatIsoDate, localDateTimeToInstant, parseIsoDate, walkOccurrences, type CalendarDate } from './recurrence-date.js';

export const RECURRENCE_HORIZON_DAYS = 90;
export const RECURRENCE_MAX_INSTANCES_PER_RUN = 400;
export const RECURRENCE_LOCK_NAMESPACE = 1_907_070_1;

type TransactionClient = Prisma.TransactionClient;

function calendarDate(value: Date): CalendarDate {
  return parseIsoDate(value.toISOString().slice(0, 10));
}

function databaseDate(value: CalendarDate): Date {
  return new Date(`${formatIsoDate(value)}T00:00:00.000Z`);
}

function localTime(value: string | null): { hour: number; minute: number } {
  if (value === null) return { hour: 0, minute: 0 };
  return { hour: Number(value.slice(0, 2)), minute: Number(value.slice(3, 5)) };
}

@Injectable()
export class RecurrenceMaterializerService {
  constructor(private readonly prisma: PrismaService) {}

  async materializeRule(ruleId: string): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const lock = await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(${RECURRENCE_LOCK_NAMESPACE}, hashtext(${ruleId})) AS locked
      `;
      if (lock[0]?.locked !== true) return 0;

      const rule = await tx.recurrenceRule.findUnique({ where: { id: ruleId } });
      if (rule === null) return 0;

      const taskTemplate = await tx.task.findFirst({
        where: { recurrenceRuleId: ruleId },
        orderBy: { occurrenceDate: 'asc' },
      });
      const eventTemplate = await tx.event.findFirst({
        where: { recurrenceRuleId: ruleId },
        orderBy: { occurrenceDate: 'asc' },
      });
      if (taskTemplate === null && eventTemplate === null) return 0;

      const today = parseIsoDate(new Date().toISOString().slice(0, 10));
      const horizon = addDays(today, RECURRENCE_HORIZON_DAYS);
      const occurrences = walkOccurrences({
        freq: rule.freq,
        interval: rule.interval,
        startsOn: calendarDate(rule.startsOn),
        endsOn: rule.endsOn === null ? null : calendarDate(rule.endsOn),
        count: rule.count,
      }, { horizon }).slice(0, RECURRENCE_MAX_INSTANCES_PER_RUN);

      const created = taskTemplate !== null
        ? await this.materializeTaskOccurrences(tx, rule, taskTemplate, occurrences)
        : await this.materializeEventOccurrences(tx, rule, eventTemplate!, occurrences);

      await tx.recurrenceRule.update({
        where: { id: ruleId },
        data: { materializedThrough: databaseDate(horizon) },
      });
      return created;
    });
  }

  private async materializeTaskOccurrences(
    tx: TransactionClient,
    rule: Awaited<ReturnType<TransactionClient['recurrenceRule']['findUnique']>> & {},
    template: NonNullable<Awaited<ReturnType<TransactionClient['task']['findFirst']>>>,
    occurrences: CalendarDate[],
  ): Promise<number> {
    const time = localTime(rule.startTimeLocal);
    const result = await tx.task.createMany({
      data: occurrences.map((occurrence) => ({
        householdId: rule.householdId,
        title: template.title,
        description: template.description,
        status: template.status,
        priority: template.priority,
        dueDate: localDateTimeToInstant(occurrence, time.hour, time.minute, rule.timezone),
        createdBy: template.createdBy,
        recurrenceRuleId: rule.id,
        occurrenceDate: databaseDate(occurrence),
      })),
      skipDuplicates: true,
    });
    const taskIds = (await tx.task.findMany({
      where: { recurrenceRuleId: rule.id },
      select: { id: true },
    })).map(({ id }) => id);
    await this.materializeTaskAssociations(tx, template.id, taskIds);
    return result.count;
  }

  private async materializeEventOccurrences(
    tx: TransactionClient,
    rule: Awaited<ReturnType<TransactionClient['recurrenceRule']['findUnique']>> & {},
    template: NonNullable<Awaited<ReturnType<TransactionClient['event']['findFirst']>>>,
    occurrences: CalendarDate[],
  ): Promise<number> {
    const time = localTime(rule.startTimeLocal);
    const durationMs = (rule.durationMinutes ?? 0) * 60_000;
    const result = await tx.event.createMany({
      data: occurrences.map((occurrence) => {
        const startTime = localDateTimeToInstant(occurrence, time.hour, time.minute, rule.timezone);
        return {
          householdId: rule.householdId,
          title: template.title,
          description: template.description,
          startTime,
          endTime: new Date(startTime.getTime() + durationMs),
          allDay: template.allDay,
          location: template.location,
          createdBy: template.createdBy,
          recurrenceRuleId: rule.id,
          occurrenceDate: databaseDate(occurrence),
        };
      }),
      skipDuplicates: true,
    });
    const eventIds = (await tx.event.findMany({ where: { recurrenceRuleId: rule.id }, select: { id: true } })).map(({ id }) => id);
    const labels = await tx.eventLabel.findMany({ where: { eventId: template.id }, select: { labelId: true } });
    if (labels.length > 0) {
      await tx.eventLabel.createMany({
        data: eventIds.flatMap((eventId) => labels.map(({ labelId }) => ({ eventId, labelId }))),
        skipDuplicates: true,
      });
    }
    return result.count;
  }

  private async materializeTaskAssociations(tx: TransactionClient, templateTaskId: string, newTaskIds: string[]): Promise<void> {
    const [assignees, labels] = await Promise.all([
      tx.taskAssignee.findMany({ where: { taskId: templateTaskId }, select: { userId: true } }),
      tx.taskLabel.findMany({ where: { taskId: templateTaskId }, select: { labelId: true } }),
    ]);
    if (assignees.length > 0) {
      await tx.taskAssignee.createMany({
        data: newTaskIds.flatMap((taskId) => assignees.map(({ userId }) => ({ taskId, userId }))),
        skipDuplicates: true,
      });
    }
    if (labels.length > 0) {
      await tx.taskLabel.createMany({
        data: newTaskIds.flatMap((taskId) => labels.map(({ labelId }) => ({ taskId, labelId }))),
        skipDuplicates: true,
      });
    }
  }
}
