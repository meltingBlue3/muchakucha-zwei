import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import {
  RECURRENCE_MAX_INSTANCES_PER_RUN,
  addDays,
  currentCalendarDateIn,
  formatIsoDate,
  localDateTimeToInstant,
  parseIsoDate,
  walkOccurrences,
  type CalendarDate,
} from './recurrence-date.js';

export { RECURRENCE_MAX_INSTANCES_PER_RUN } from './recurrence-date.js';
export const RECURRENCE_LOCK_NAMESPACE = 1_907_070_1;

// D-11: the lookahead window is per-frequency, not a single fixed number of
// days. daily=0 means "today" only appears after the rule's own local
// midnight; weekly=6 means a rule becomes eligible exactly one week minus a
// day before it is due. monthly/yearly reuse 6 as an adjustable default (the
// user did not specify one) — not a hard constraint; revisit with real usage
// feedback.
export const RECURRENCE_LOOKAHEAD_DAYS: Record<string, number> = {
  daily: 0,
  weekly: 6,
  monthly: 6,
  yearly: 6,
};
export const RECURRENCE_MAX_LOOKAHEAD_DAYS = 6;

export function lookaheadFor(freq: string): number {
  return RECURRENCE_LOOKAHEAD_DAYS[freq] ?? RECURRENCE_MAX_LOOKAHEAD_DAYS;
}

type TransactionClient = Prisma.TransactionClient;

export interface MaterializationResult {
  /**
   * True when another writer held the rule's advisory lock, so this call
   * generated nothing and the other writer is responsible for the work.
   * Distinguishing it from a genuine no-op is what lets a caller explain a
   * series that momentarily shows only its first occurrence.
   */
  skipped: boolean;
  created: number;
}

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
  private readonly logger = new Logger(RecurrenceMaterializerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async materializeAllDue(): Promise<number> {
    const utcToday = parseIsoDate(new Date().toISOString().slice(0, 10));
    // Superset prefilter only: this is a SQL-side bound to keep
    // RecurrenceRule_materialized_through_idx useful, not the exact due
    // decision. Each rule's exact eligibility depends on its own freq and
    // timezone and is decided inside materializeRule. A rule's local calendar
    // date is at most 1 day ahead of the UTC date, so max lookahead + 1 is a
    // safe superset.
    const prefilter = databaseDate(addDays(utcToday, RECURRENCE_MAX_LOOKAHEAD_DAYS + 1));
    const dueRules = await this.prisma.recurrenceRule.findMany({
      where: {
        OR: [
          { materializedThrough: null },
          { materializedThrough: { lt: prefilter } },
        ],
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    let created = 0;
    for (const rule of dueRules) {
      try {
        created += (await this.materializeRule(rule.id)).created;
      } catch (error: unknown) {
        // One rule's timezone becoming unresolvable (e.g. an ICU data
        // change) must not abort the tick for every other household.
        this.logger.error(`materialization failed for rule ${rule.id}`, error);
      }
    }
    return created;
  }

  async materializeRule(ruleId: string): Promise<MaterializationResult> {
    return this.prisma.$transaction(async (tx) => {
      const lock = await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(${RECURRENCE_LOCK_NAMESPACE}, hashtext(${ruleId})) AS locked
      `;
      if (lock[0]?.locked !== true) {
        this.logger.warn(`materialization skipped: rule ${ruleId} is locked by another writer`);
        return { skipped: true, created: 0 };
      }

      const rule = await tx.recurrenceRule.findUnique({ where: { id: ruleId } });
      if (rule === null) return { skipped: false, created: 0 };

      const taskTemplate = await tx.task.findFirst({
        where: { recurrenceRuleId: ruleId },
        orderBy: { occurrenceDate: 'asc' },
      });
      const eventTemplate = await tx.event.findFirst({
        where: { recurrenceRuleId: ruleId },
        orderBy: { occurrenceDate: 'asc' },
      });
      if (taskTemplate === null && eventTemplate === null) return { skipped: false, created: 0 };

      // D-11: horizon is anchored on the RULE's own local calendar date, not
      // the server's UTC date — a 0-day daily lookahead must produce "today"
      // at this rule's local midnight, not whenever the server's UTC date
      // happens to roll over.
      const today = currentCalendarDateIn(rule.timezone);
      const horizon = addDays(today, lookaheadFor(rule.freq));
      // Resume at the watermark instead of re-walking the whole history: the
      // per-run cap truncates the tail of what is emitted, so starting at
      // `startsOn` every time meant the cap always kept the OLDEST occurrences
      // and the series silently stopped extending once it grew past the cap.
      const walkStart = rule.materializedThrough === null
        ? calendarDate(rule.startsOn)
        : addDays(calendarDate(rule.materializedThrough), 1);
      const occurrences = walkOccurrences({
        freq: rule.freq,
        interval: rule.interval,
        byWeekday: rule.byWeekday,
        startsOn: calendarDate(rule.startsOn),
        endsOn: rule.endsOn === null ? null : calendarDate(rule.endsOn),
        count: rule.count,
      }, { horizon, from: walkStart });

      const created = taskTemplate !== null
        ? await this.materializeTaskOccurrences(tx, rule, taskTemplate, occurrences)
        : await this.materializeEventOccurrences(tx, rule, eventTemplate!, occurrences);

      // Never claim coverage past what this run actually wrote — a truncated
      // run must leave the remainder due so the next tick picks it up.
      const truncated = occurrences.length === RECURRENCE_MAX_INSTANCES_PER_RUN;
      await tx.recurrenceRule.update({
        where: { id: ruleId },
        data: {
          materializedThrough: databaseDate(
            truncated ? occurrences[occurrences.length - 1]! : horizon,
          ),
        },
      });
      return { skipped: false, created };
    });
  }

  private async materializeTaskOccurrences(
    tx: TransactionClient,
    rule: Awaited<ReturnType<TransactionClient['recurrenceRule']['findUnique']>> & {},
    template: NonNullable<Awaited<ReturnType<TransactionClient['task']['findFirst']>>>,
    occurrences: CalendarDate[],
  ): Promise<number> {
    const time = localTime(rule.startTimeLocal);
    const created = await tx.task.createManyAndReturn({
      // Field values come from the rule's series template, never from a
      // sibling instance: instances are independently editable (D-02/D-07),
      // and a generated occurrence always starts its own life as `pending`
      // regardless of how any other occurrence was completed or cancelled.
      data: occurrences.map((occurrence) => ({
        householdId: rule.householdId,
        title: rule.templateTitle,
        description: rule.templateDescription,
        status: 'pending',
        priority: rule.templatePriority,
        dueDate: localDateTimeToInstant(occurrence, time.hour, time.minute, rule.timezone),
        createdBy: rule.createdBy,
        recurrenceRuleId: rule.id,
        occurrenceDate: databaseDate(occurrence),
      })),
      select: { id: true },
      skipDuplicates: true,
    });
    // Only rows written by THIS run may receive the template's associations.
    // Fanning out over every instance of the series re-inserted assignees and
    // labels a user had deliberately removed from an individual occurrence.
    if (created.length > 0) {
      await this.materializeTaskAssociations(tx, template.id, created.map(({ id }) => id));
    }
    return created.length;
  }

  private async materializeEventOccurrences(
    tx: TransactionClient,
    rule: Awaited<ReturnType<TransactionClient['recurrenceRule']['findUnique']>> & {},
    template: NonNullable<Awaited<ReturnType<TransactionClient['event']['findFirst']>>>,
    occurrences: CalendarDate[],
  ): Promise<number> {
    const time = localTime(rule.startTimeLocal);
    const durationMs = (rule.durationMinutes ?? 0) * 60_000;
    const created = await tx.event.createManyAndReturn({
      data: occurrences.map((occurrence) => {
        const startTime = localDateTimeToInstant(occurrence, time.hour, time.minute, rule.timezone);
        return {
          householdId: rule.householdId,
          title: rule.templateTitle,
          description: rule.templateDescription,
          startTime,
          endTime: new Date(startTime.getTime() + durationMs),
          allDay: rule.templateAllDay,
          location: rule.templateLocation,
          createdBy: rule.createdBy,
          recurrenceRuleId: rule.id,
          occurrenceDate: databaseDate(occurrence),
        };
      }),
      select: { id: true },
      skipDuplicates: true,
    });
    // Same rule as tasks: label fan-out is limited to rows written by this run,
    // so a label removed from one occurrence stays removed.
    if (created.length === 0) return 0;
    const labels = await tx.eventLabel.findMany({ where: { eventId: template.id }, select: { labelId: true } });
    if (labels.length > 0) {
      await tx.eventLabel.createMany({
        data: created.flatMap(({ id }) => labels.map(({ labelId }) => ({ eventId: id, labelId }))),
        skipDuplicates: true,
      });
    }
    return created.length;
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
