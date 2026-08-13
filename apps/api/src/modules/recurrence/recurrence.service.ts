import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { RecurrenceMaterializerService } from './recurrence-materializer.service.js';
import {
  addDays,
  currentCalendarDateIn,
  formatIsoDate,
  localDateTimeToInstant,
  nextOccurrenceFor,
  parseIsoDate,
  type CalendarDate,
} from './recurrence-date.js';
import type {
  RecurrenceRuleListItemDto,
  RecurrenceRuleListResponseDto,
  SeriesScope,
  UpdateRecurrenceRuleDto,
  UpdateSeriesDto,
} from './dto/recurrence.dto.js';

type TransactionClient = Prisma.TransactionClient;
type RecurrenceKind = 'event' | 'task';
type ActorRole = 'OWNER' | 'ADMIN' | 'MEMBER';

type RuleWithCounts = Prisma.RecurrenceRuleGetPayload<{
  include: { _count: { select: { tasks: true; events: true } } };
}>;

function calendarDate(value: Date): CalendarDate {
  return parseIsoDate(value.toISOString().slice(0, 10));
}

// Matches recurrence-materializer.service.ts's private helper of the same
// name. That one isn't exported, so this is a deliberate local duplicate
// rather than a cross-module import of a private implementation.
function databaseDate(value: CalendarDate): Date {
  return new Date(`${formatIsoDate(value)}T00:00:00.000Z`);
}

// Mirrors the materializer's private helper: a null start time means the
// occurrence lands at the rule's local midnight.
function localTime(value: string | null): { hour: number; minute: number } {
  if (value === null) return { hour: 0, minute: 0 };
  return { hour: Number(value.slice(0, 2)), minute: Number(value.slice(3, 5)) };
}

// WR-02: `parseIsoDate` throws a plain Error (not an HttpException) on a
// regex-valid but non-existent calendar date ("2026-02-30", "2026-13-45"),
// which StableHttpExceptionFilter maps to a 500. Every call site that feeds
// a request-supplied date string into parseIsoDate must go through this
// wrapper instead, so a malformed request stays a 400.
function parseRequestDate(value: string, field: string): CalendarDate {
  try {
    return parseIsoDate(value);
  } catch {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed.',
      details: [{ field, codes: ['invalid_date'] }],
    });
  }
}

// CR-02: the wall-clock counterpart to Intl-based helpers elsewhere in this
// module — reads the HH:mm a UTC instant falls on in the given timezone, so
// a successor rule's startTimeLocal can be derived from a submitted instance
// time rather than only ever inherited from the rule it is splitting off.
function localTimeIn(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}

interface ResolvedOccurrence {
  occurrenceDate: Date;
  createdBy: string;
  rule: NonNullable<Awaited<ReturnType<TransactionClient['recurrenceRule']['findUnique']>>>;
}

@Injectable()
export class RecurrenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly materializer: RecurrenceMaterializerService,
  ) {}

  private async resolveActorRole(actorId: string, householdId: string): Promise<ActorRole | null> {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_householdId: { userId: actorId, householdId } },
      include: { household: { select: { ownerMembershipId: true } } },
    });
    if (membership === null) return null;
    if (membership.id === membership.household.ownerMembershipId) return 'OWNER';
    return membership.role as 'ADMIN' | 'MEMBER';
  }

  private canMutate(actorRole: ActorRole, creatorId: string, actorId: string): boolean {
    if (actorRole === 'MEMBER') return creatorId === actorId;
    return true;
  }

  private toListItem(rule: RuleWithCounts): RecurrenceRuleListItemDto {
    // A rule only ever owns rows in one of the two instance relations. Both
    // counts at 0 means every generated row has been deleted (e.g. ended or
    // split away) — the type can no longer be recovered, so null beats a
    // guess.
    const kind: 'task' | 'event' | null = rule._count.tasks > 0
      ? 'task'
      : rule._count.events > 0 ? 'event' : null;
    // D-16: `today` must be computed per-rule in the RULE's own time zone —
    // a list spanning rules in different time zones cannot share one "today".
    const today = currentCalendarDateIn(rule.timezone);
    const next = nextOccurrenceFor({
      freq: rule.freq,
      interval: rule.interval,
      byWeekday: rule.byWeekday,
      startsOn: calendarDate(rule.startsOn),
      endsOn: rule.endsOn === null ? null : calendarDate(rule.endsOn),
      count: rule.count,
    }, today);
    return {
      id: rule.id,
      kind,
      title: rule.templateTitle,
      freq: rule.freq,
      interval: rule.interval,
      byWeekday: rule.byWeekday,
      startsOn: formatIsoDate(calendarDate(rule.startsOn)),
      endsOn: rule.endsOn === null ? null : formatIsoDate(calendarDate(rule.endsOn)),
      count: rule.count,
      timezone: rule.timezone,
      startTimeLocal: rule.startTimeLocal,
      durationMinutes: rule.durationMinutes,
      nextOccurrenceDate: next === null ? null : formatIsoDate(next),
    };
  }

  async listRules(actorId: string, householdId: string): Promise<RecurrenceRuleListResponseDto> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) {
      throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });
    }
    const rules = await this.prisma.recurrenceRule.findMany({
      where: { householdId },
      include: { _count: { select: { tasks: true, events: true } } },
    });
    const items = rules.map((rule) => this.toListItem(rule));
    // Contract: unresolved (non-null nextOccurrenceDate) rules first, sorted
    // by that date ascending, tied broken by title; ended/exhausted rules
    // (null nextOccurrenceDate) after, sorted by title. Ended rules stay in
    // the list — D-14: "结束" is not "删除".
    items.sort((left, right) => {
      if (left.nextOccurrenceDate !== null && right.nextOccurrenceDate !== null) {
        return left.nextOccurrenceDate === right.nextOccurrenceDate
          ? left.title.localeCompare(right.title)
          : left.nextOccurrenceDate.localeCompare(right.nextOccurrenceDate);
      }
      if (left.nextOccurrenceDate !== null) return -1;
      if (right.nextOccurrenceDate !== null) return 1;
      return left.title.localeCompare(right.title);
    });
    return { rules: items, total: items.length };
  }

  async getRule(actorId: string, householdId: string, ruleId: string): Promise<RecurrenceRuleListItemDto> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) {
      throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });
    }
    const rule = await this.prisma.recurrenceRule.findUnique({
      where: { id: ruleId },
      include: { _count: { select: { tasks: true, events: true } } },
    });
    if (rule === null || rule.householdId !== householdId) {
      throw new NotFoundException({ code: 'RECURRENCE_RULE_NOT_FOUND', message: 'Recurrence rule not found.' });
    }
    return this.toListItem(rule);
  }

  private async resolveRuleForOccurrence(
    tx: TransactionClient,
    kind: RecurrenceKind,
    householdId: string,
    occurrenceId: string,
  ): Promise<ResolvedOccurrence> {
    const occurrence = kind === 'task'
      ? await tx.task.findUnique({ where: { id: occurrenceId } })
      : await tx.event.findUnique({ where: { id: occurrenceId } });
    if (occurrence === null || occurrence.householdId !== householdId) {
      const code = kind === 'task' ? 'TASK_NOT_FOUND' : 'EVENT_NOT_FOUND';
      throw new NotFoundException({ code, message: kind === 'task' ? 'Task not found.' : 'Event not found.' });
    }
    if (occurrence.recurrenceRuleId === null || occurrence.occurrenceDate === null) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        details: [{ field: 'scope', codes: ['not_a_series_occurrence'] }],
      });
    }
    const rule = await tx.recurrenceRule.findUnique({ where: { id: occurrence.recurrenceRuleId } });
    if (rule === null || rule.householdId !== householdId) {
      throw new NotFoundException({ code: 'RECURRENCE_RULE_NOT_FOUND', message: 'Recurrence rule not found.' });
    }
    return { occurrenceDate: occurrence.occurrenceDate, createdBy: occurrence.createdBy, rule };
  }

  async cancelOccurrence(
    actorId: string,
    householdId: string,
    kind: RecurrenceKind,
    occurrenceId: string,
  ): Promise<void> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) {
      throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });
    }
    await this.prisma.$transaction(async (tx) => {
      const occurrence = await this.resolveRuleForOccurrence(tx, kind, householdId, occurrenceId);
      if (!this.canMutate(role, occurrence.createdBy, actorId)) {
        throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only the creator, admin, or owner can cancel this occurrence.' });
      }
      if (kind === 'task') {
        await tx.task.update({ where: { id: occurrenceId }, data: { status: 'cancelled' } });
      } else {
        await tx.event.update({ where: { id: occurrenceId }, data: { cancelledAt: new Date() } });
      }
    });
  }

  async updateSeriesFromOccurrence(
    actorId: string,
    householdId: string,
    kind: RecurrenceKind,
    occurrenceId: string,
    input: UpdateSeriesDto,
  ): Promise<{ recurrenceRuleId: string }> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) {
      throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });
    }

    const newRuleId = await this.prisma.$transaction(async (tx) => {
      const occurrence = await this.resolveRuleForOccurrence(tx, kind, householdId, occurrenceId);
      if (!this.canMutate(role, occurrence.createdBy, actorId)) {
        throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only the creator, admin, or owner can update this series.' });
      }

      const splitDate = occurrence.occurrenceDate;
      const splitCalendarDate = parseIsoDate(splitDate.toISOString().slice(0, 10));
      await tx.recurrenceRule.update({
        where: { id: occurrence.rule.id },
        data: {
          endsOn: new Date(`${formatIsoDate(addDays(splitCalendarDate, -1))}T00:00:00.000Z`),
          count: null,
        },
      });

      const recurrence = input.recurrence;
      if (recurrence?.endsOn !== undefined && recurrence.count !== undefined) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed.',
          details: [{ field: 'recurrence.endsOn', codes: ['ends_on_and_count_mutually_exclusive'] }],
        });
      }

      const elapsedCount = kind === 'task'
        ? await tx.task.count({ where: { recurrenceRuleId: occurrence.rule.id, occurrenceDate: { lt: splitDate } } })
        : await tx.event.count({ where: { recurrenceRuleId: occurrence.rule.id, occurrenceDate: { lt: splitDate } } });
      const inheritedCount = occurrence.rule.count === null
        ? null
        : Math.max(occurrence.rule.count - elapsedCount, 0) || null;

      // Resolve the successor series' template BEFORE creating the rule: the
      // rule carries the template fields the materializer generates from, so
      // they must agree with the first instance row written below.
      const taskSource = kind === 'task'
        ? await tx.task.findUniqueOrThrow({
          where: { id: occurrenceId },
          include: { assignees: true, labels: true },
        })
        : null;
      const eventSource = kind === 'event'
        ? await tx.event.findUniqueOrThrow({
          where: { id: occurrenceId },
          include: { labels: true },
        })
        : null;
      const nextTitle = input.title?.trim() ?? (kind === 'task' ? taskSource!.title : eventSource!.title);
      const nextDescription = input.description === undefined
        ? (kind === 'task' ? taskSource!.description : eventSource!.description)
        : input.description.trim() || null;
      const nextPriority = input.priority ?? (kind === 'task' ? taskSource!.priority : 'medium');
      const nextLocation = kind === 'event'
        ? (input.location === undefined ? eventSource!.location : input.location.trim() || null)
        : null;
      const nextAllDay = kind === 'event' ? (input.allDay ?? eventSource!.allDay) : false;
      // Label edits used to be dropped on this path: the successor always
      // inherited the pre-edit occurrence's labels, so a removed label came
      // back on every occurrence of the new series.
      const nextLabelIds = input.labelIds === undefined
        ? (kind === 'task' ? taskSource!.labels : eventSource!.labels).map(({ labelId }) => labelId)
        : [...new Set(input.labelIds)];
      if (input.labelIds !== undefined && nextLabelIds.length > 0) {
        const labelCount = await tx.label.count({
          where: { householdId, id: { in: nextLabelIds } },
        });
        if (labelCount !== nextLabelIds.length) {
          throw new BadRequestException({
            code: 'VALIDATION_FAILED',
            message: 'Request validation failed.',
            details: [{ field: 'labelIds', codes: ['not_household_label'] }],
          });
        }
      }

      // CR-04: `recurrence.endsOn` used to reach Prisma via a raw `new Date()`
      // (regex-valid but calendar-invalid input like "2026-02-30" silently
      // rolls over instead of rejecting; "2026-13-45" 500s after the old
      // rule's endsOn/count were already mutated in this same transaction).
      // Every other call site guards this with parseIsoDate — this one now
      // does too, wrapped so a bad date stays a 400.
      const successorEndsOn = recurrence?.endsOn === undefined
        ? null
        : parseRequestDate(recurrence.endsOn, 'recurrence.endsOn');

      // CR-02: the successor's clock fields used to be inherited from the OLD
      // rule unconditionally, even when the request changed the occurrence's
      // own time — `input.startTime`/`input.endTime` (events) or
      // `input.dueDate` (tasks) were written onto the edited instance but
      // never propagated to the rule those fields drive future generation
      // from. An explicit `recurrence.startTimeLocal`/`durationMinutes` still
      // wins outright (a rule-change edit); short of that, derive from
      // whatever instance time the request actually supplied before falling
      // back to what the old rule already had.
      const successorTimezone = recurrence?.timezone ?? occurrence.rule.timezone;
      const nextStartTimeLocal = recurrence?.startTimeLocal ?? (
        kind === 'event' && input.startTime !== undefined
          ? localTimeIn(new Date(input.startTime), successorTimezone)
          : kind === 'task' && input.dueDate !== undefined
            ? localTimeIn(new Date(input.dueDate), successorTimezone)
            : occurrence.rule.startTimeLocal
      );
      const nextDurationMinutes = recurrence?.durationMinutes ?? (
        kind === 'event' && input.startTime !== undefined && input.endTime !== undefined
          ? Math.round((new Date(input.endTime).getTime() - new Date(input.startTime).getTime()) / 60_000)
          : occurrence.rule.durationMinutes
      );
      // Same DB CHECK CR-01 guards on create — a submitted instance span over
      // 24h reaching this successor rule would violate it identically.
      if (nextDurationMinutes !== null && nextDurationMinutes > 1440) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed.',
          details: [{
            field: 'endTime',
            codes: ['recurring_duration_too_long'],
            message: '重复事件的单次时长不能超过 24 小时。',
          }],
        });
      }

      const createdRule = await tx.recurrenceRule.create({
        data: {
          householdId: occurrence.rule.householdId,
          createdBy: occurrence.rule.createdBy,
          freq: recurrence?.freq ?? occurrence.rule.freq,
          interval: recurrence?.interval ?? occurrence.rule.interval,
          byWeekday: recurrence?.byWeekday ?? occurrence.rule.byWeekday,
          startsOn: splitDate,
          endsOn: recurrence === undefined
            ? occurrence.rule.endsOn
            : successorEndsOn === null ? null : databaseDate(successorEndsOn),
          count: recurrence === undefined ? inheritedCount : recurrence.count ?? null,
          timezone: successorTimezone,
          startTimeLocal: nextStartTimeLocal,
          durationMinutes: nextDurationMinutes,
          templateTitle: nextTitle,
          templateDescription: nextDescription,
          templatePriority: nextPriority,
          templateLocation: nextLocation,
          templateAllDay: nextAllDay,
          materializedThrough: null,
        },
      });

      if (kind === 'task') {
        const template = taskSource!;
        await tx.task.deleteMany({
          where: { recurrenceRuleId: occurrence.rule.id, occurrenceDate: { gte: splitDate } },
        });
        const assigneeIds = input.assigneeIds ?? template.assignees.map(({ userId }) => userId);
        if (assigneeIds.length > 0) {
          const memberCount = await tx.membership.count({
            where: { householdId, userId: { in: [...new Set(assigneeIds)] } },
          });
          if (memberCount !== new Set(assigneeIds).size) {
            throw new BadRequestException({
              code: 'VALIDATION_FAILED',
              message: 'Request validation failed.',
              details: [{ field: 'assigneeIds', codes: ['not_household_member'] }],
            });
          }
        }
        await tx.task.create({
          data: {
            householdId: occurrence.rule.householdId,
            createdBy: occurrence.rule.createdBy,
            recurrenceRuleId: createdRule.id,
            occurrenceDate: splitDate,
            title: nextTitle,
            description: nextDescription,
            status: input.status ?? template.status,
            priority: nextPriority,
            dueDate: input.dueDate === undefined ? template.dueDate : new Date(input.dueDate),
            assignees: { create: [...new Set(assigneeIds)].map((userId) => ({ userId })) },
            labels: { create: nextLabelIds.map((labelId) => ({ labelId })) },
          },
        });
      } else {
        const template = eventSource!;
        await tx.event.deleteMany({
          where: { recurrenceRuleId: occurrence.rule.id, occurrenceDate: { gte: splitDate } },
        });
        await tx.event.create({
          data: {
            householdId: occurrence.rule.householdId,
            createdBy: occurrence.rule.createdBy,
            recurrenceRuleId: createdRule.id,
            occurrenceDate: splitDate,
            title: nextTitle,
            description: nextDescription,
            startTime: input.startTime === undefined ? template.startTime : new Date(input.startTime),
            endTime: input.endTime === undefined ? template.endTime : new Date(input.endTime),
            allDay: nextAllDay,
            location: nextLocation,
            labels: { create: nextLabelIds.map((labelId) => ({ labelId })) },
          },
        });
      }
      return createdRule.id;
    });

    await this.materializer.materializeRule(newRuleId);
    return { recurrenceRuleId: newRuleId };
  }

  /**
   * Edits a recurrence directly from the RULE, with no occurrence to anchor
   * on: the split anchor is tomorrow in the rule's own timezone.
   *
   * Structurally a sibling of `updateSeriesFromOccurrence`, with three
   * deliberate substitutions (07-RESEARCH-ADDENDUM §8):
   *
   * 1. The anchor is `tomorrow` rather than a selected occurrence's date.
   *    Under D-11's per-frequency lookahead a healthy weekly rule routinely
   *    has no future occurrence at all, so the rule detail screen has no
   *    occurrenceId to hand the occurrence-level path.
   * 2. The successor's template comes from the rule's own `template_*`
   *    columns (CR-01), never from an instance row. A rule-level edit has no
   *    "the one you selected", and instances are independently renameable
   *    (D-02/D-07) — reading a template off an instance would leak a single
   *    occurrence's edit into every future occurrence of the successor.
   * 3. Assignees and labels still come from the rule's nearest instance: the
   *    rule carries no assignee/label template columns. This is the
   *    documented Path B fallback, not an oversight.
   *
   * D-08: the entire split is one interactive transaction. A half-applied
   * split — old rule terminated, successor never created — silently ends a
   * household's recurrence, which is exactly the failure the atomicity
   * requirement exists to prevent.
   */
  async updateRuleFromAnchor(
    actorId: string,
    householdId: string,
    ruleId: string,
    input: UpdateRecurrenceRuleDto,
  ): Promise<{ recurrenceRuleId: string }> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) {
      throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });
    }

    const recurrence = input.recurrence;
    // Same shape and wording as the /series path: two conflicting bounds are a
    // request error, not something to silently resolve in favour of one.
    if (recurrence.endsOn !== undefined && recurrence.count !== undefined) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        details: [{ field: 'recurrence.endsOn', codes: ['ends_on_and_count_mutually_exclusive'] }],
      });
    }

    const newRuleId = await this.prisma.$transaction(async (tx) => {
      const rule = await tx.recurrenceRule.findUnique({ where: { id: ruleId } });
      // Ownership is checked BEFORE the role (SAFE-01 / T-07-39): a
      // client-supplied ruleId has no resolved occurrence to cross-check
      // against, so another household's rule must be indistinguishable from
      // one that does not exist.
      if (rule === null || rule.householdId !== householdId) {
        throw new NotFoundException({ code: 'RECURRENCE_RULE_NOT_FOUND', message: 'Recurrence rule not found.' });
      }
      if (!this.canMutate(role, rule.createdBy, actorId)) {
        throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only the creator, admin, or owner can update this series.' });
      }

      // Tomorrow in the RULE's own timezone — same anchor as endRule. Today's
      // occurrence may already be completed; anchoring on today would delete
      // it and rewrite something that has already happened.
      const anchorCalendar = addDays(currentCalendarDateIn(rule.timezone), 1);
      const anchor = databaseDate(anchorCalendar);

      // Kind is derived from which instance relation the rule owns, exactly
      // as toListItem derives it. With rows on neither relation the rule
      // cannot prove which kind of successor to build, and a guess writes to
      // the wrong table.
      const taskCount = await tx.task.count({ where: { recurrenceRuleId: ruleId } });
      const eventCount = taskCount > 0
        ? 0
        : await tx.event.count({ where: { recurrenceRuleId: ruleId } });
      const kind: RecurrenceKind | null = taskCount > 0 ? 'task' : eventCount > 0 ? 'event' : null;
      if (kind === null) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed.',
          details: [{ field: 'ruleId', codes: ['rule_has_no_occurrences'] }],
        });
      }

      const elapsedCount = kind === 'task'
        ? await tx.task.count({ where: { recurrenceRuleId: ruleId, occurrenceDate: { lt: anchor } } })
        : await tx.event.count({ where: { recurrenceRuleId: ruleId, occurrenceDate: { lt: anchor } } });
      const inheritedCount = rule.count === null
        ? null
        : Math.max(rule.count - elapsedCount, 0) || null;

      // Date-bound the old rule at the day before the anchor and clear its
      // count in the same statement: endsOn and count are mutually exclusive,
      // so a rule that keeps both carries two conflicting ends.
      await tx.recurrenceRule.update({
        where: { id: rule.id },
        data: { endsOn: databaseDate(addDays(anchorCalendar, -1)), count: null },
      });

      const successorEndsOn = recurrence.endsOn === undefined ? null : parseRequestDate(recurrence.endsOn, 'recurrence.endsOn');
      // An explicit count wins; with neither bound given the successor
      // inherits the old rule's remaining occurrences.
      const successorCount = recurrence.count
        ?? (recurrence.endsOn === undefined ? inheritedCount : null);
      const firstOccurrence = nextOccurrenceFor({
        freq: recurrence.freq,
        interval: recurrence.interval ?? 1,
        byWeekday: recurrence.byWeekday ?? [],
        startsOn: anchorCalendar,
        endsOn: successorEndsOn,
        count: successorCount,
      }, anchorCalendar);
      if (firstOccurrence === null) {
        // Reject rather than create a rule that can never produce anything.
        // The transaction rolls the old rule's endsOn/count back to exactly
        // what they were, so a rejected edit leaves no trace.
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed.',
          details: [{
            field: 'recurrence.endsOn',
            codes: ['no_occurrence_in_range'],
            message: '重复规则在结束日期前没有可生成的日期。',
          }],
        });
      }

      const createdRule = await tx.recurrenceRule.create({
        data: {
          householdId: rule.householdId,
          createdBy: rule.createdBy,
          freq: recurrence.freq,
          interval: recurrence.interval ?? 1,
          byWeekday: recurrence.byWeekday ?? [],
          // The successor starts at the anchor, not at the body's `startsOn`.
          // "此后所有" is defined by the anchor; letting the request move the
          // start would let a rule-level edit reach backwards into history.
          startsOn: anchor,
          endsOn: successorEndsOn === null ? null : databaseDate(successorEndsOn),
          count: successorCount,
          timezone: recurrence.timezone,
          startTimeLocal: recurrence.startTimeLocal ?? rule.startTimeLocal,
          durationMinutes: recurrence.durationMinutes ?? rule.durationMinutes,
          // Template fields come from the OLD RULE's template_* columns, never
          // from an instance row — see this method's doc comment (2).
          templateTitle: rule.templateTitle,
          templateDescription: rule.templateDescription,
          templatePriority: rule.templatePriority,
          templateLocation: rule.templateLocation,
          templateAllDay: rule.templateAllDay,
          materializedThrough: null,
        },
      });

      // Path B fallback for the two things the rule has no template column
      // for. Prefer the earliest instance at or after the anchor (the very
      // occurrence the successor replaces); fall back to the latest before it
      // for a rule whose future rows are all outside the generation window.
      // Read BEFORE the delete below — the preferred source is exactly what
      // that delete removes.
      const taskSource = kind === 'task'
        ? (await tx.task.findFirst({
          where: { recurrenceRuleId: ruleId, occurrenceDate: { gte: anchor } },
          orderBy: { occurrenceDate: 'asc' },
          include: { assignees: true, labels: true },
        })) ?? (await tx.task.findFirst({
          where: { recurrenceRuleId: ruleId, occurrenceDate: { lt: anchor } },
          orderBy: { occurrenceDate: 'desc' },
          include: { assignees: true, labels: true },
        }))
        : null;
      const eventSource = kind === 'event'
        ? (await tx.event.findFirst({
          where: { recurrenceRuleId: ruleId, occurrenceDate: { gte: anchor } },
          orderBy: { occurrenceDate: 'asc' },
          include: { labels: true },
        })) ?? (await tx.event.findFirst({
          where: { recurrenceRuleId: ruleId, occurrenceDate: { lt: anchor } },
          orderBy: { occurrenceDate: 'desc' },
          include: { labels: true },
        }))
        : null;

      // Deliberately NOT this.endSeriesAt: that helper also writes the old
      // rule's endsOn, which the split already set above. A split and an end
      // are different operations — a split hands the future to a successor
      // rule — so they must not be merged into one call site.
      if (kind === 'task') {
        await tx.task.deleteMany({
          where: { recurrenceRuleId: ruleId, occurrenceDate: { gte: anchor } },
        });
      } else {
        await tx.event.deleteMany({
          where: { recurrenceRuleId: ruleId, occurrenceDate: { gte: anchor } },
        });
      }

      // D-17: the successor MUST carry a seed instance row. The materializer
      // derives a rule's kind and copies its assignees/labels from the rule's
      // earliest instance — with no seed the successor is an untyped rule
      // that can never generate anything, and the rule list cannot show its
      // kind. Its position is the successor's first occurrence from the
      // anchor, which may be weeks outside the generation window.
      const time = localTime(createdRule.startTimeLocal);
      const seedInstant = localDateTimeToInstant(firstOccurrence, time.hour, time.minute, createdRule.timezone);
      const seedOccurrenceDate = databaseDate(firstOccurrence);
      if (kind === 'task') {
        await tx.task.create({
          data: {
            householdId: createdRule.householdId,
            createdBy: createdRule.createdBy,
            recurrenceRuleId: createdRule.id,
            occurrenceDate: seedOccurrenceDate,
            title: createdRule.templateTitle,
            description: createdRule.templateDescription,
            // A generated occurrence always begins its own life pending, no
            // matter how the inheritance source was completed or cancelled.
            status: 'pending',
            priority: createdRule.templatePriority,
            dueDate: seedInstant,
            assignees: { create: (taskSource?.assignees ?? []).map(({ userId }) => ({ userId })) },
            labels: { create: (taskSource?.labels ?? []).map(({ labelId }) => ({ labelId })) },
          },
        });
      } else {
        await tx.event.create({
          data: {
            householdId: createdRule.householdId,
            createdBy: createdRule.createdBy,
            recurrenceRuleId: createdRule.id,
            occurrenceDate: seedOccurrenceDate,
            title: createdRule.templateTitle,
            description: createdRule.templateDescription,
            startTime: seedInstant,
            endTime: new Date(seedInstant.getTime() + (createdRule.durationMinutes ?? 0) * 60_000),
            allDay: createdRule.templateAllDay,
            location: createdRule.templateLocation,
            labels: { create: (eventSource?.labels ?? []).map(({ labelId }) => ({ labelId })) },
          },
        });
      }
      return createdRule.id;
    });

    // Locked Phase 7 decision: successor materialization begins only after the
    // split transaction COMMITS. materializeRule opens its own transaction and
    // takes the rule's advisory lock; nesting it here would hold that lock for
    // the whole split and make the split's duration depend on generation.
    await this.materializer.materializeRule(newRuleId);
    return { recurrenceRuleId: newRuleId };
  }

  // Shared by deleteSeriesFromOccurrence's this_and_following branch and
  // endRule (CR-05's lesson: two independent copies of "end a series" drift).
  // A rule only ever owns rows in one of the two instance relations, so
  // running both deleteMany calls unconditionally is a deliberate zero-row
  // no-op on whichever relation the rule doesn't have — this keeps the
  // shared body from needing to know the rule's kind at all.
  private async endSeriesAt(tx: TransactionClient, ruleId: string, anchor: Date): Promise<void> {
    await tx.recurrenceRule.update({
      where: { id: ruleId },
      data: {
        // The series ends the day BEFORE the anchor: the anchor itself is the
        // first occurrence that no longer belongs to the series.
        endsOn: databaseDate(addDays(calendarDate(anchor), -1)),
        // endsOn and count are mutually exclusive bounds; a date bound must
        // clear the count bound or the rule carries two conflicting ends.
        count: null,
      },
    });
    await tx.task.deleteMany({
      where: { recurrenceRuleId: ruleId, occurrenceDate: { gte: anchor } },
    });
    await tx.event.deleteMany({
      where: { recurrenceRuleId: ruleId, occurrenceDate: { gte: anchor } },
    });
  }

  async deleteSeriesFromOccurrence(
    actorId: string,
    householdId: string,
    kind: RecurrenceKind,
    occurrenceId: string,
    scope: SeriesScope,
  ): Promise<void> {
    if (scope === 'this_only') {
      await this.cancelOccurrence(actorId, householdId, kind, occurrenceId);
      return;
    }

    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) {
      throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });
    }
    await this.prisma.$transaction(async (tx) => {
      const occurrence = await this.resolveRuleForOccurrence(tx, kind, householdId, occurrenceId);
      if (!this.canMutate(role, occurrence.createdBy, actorId)) {
        throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only the creator, admin, or owner can delete this series.' });
      }
      await this.endSeriesAt(tx, occurrence.rule.id, occurrence.occurrenceDate);
    });
  }

  // Ends a recurrence directly from the rule, with no occurrence to anchor
  // on. The anchor is tomorrow in the rule's OWN timezone, not today: today's
  // occurrence may already be completed, and anchoring on today would
  // silently delete it — contradicting what "end this recurrence" means.
  async endRule(actorId: string, householdId: string, ruleId: string): Promise<void> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) {
      throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });
    }
    await this.prisma.$transaction(async (tx) => {
      const rule = await tx.recurrenceRule.findUnique({ where: { id: ruleId } });
      if (rule === null || rule.householdId !== householdId) {
        throw new NotFoundException({ code: 'RECURRENCE_RULE_NOT_FOUND', message: 'Recurrence rule not found.' });
      }
      if (!this.canMutate(role, rule.createdBy, actorId)) {
        throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only the creator, admin, or owner can end this series.' });
      }
      const anchor = databaseDate(addDays(currentCalendarDateIn(rule.timezone), 1));
      await this.endSeriesAt(tx, rule.id, anchor);
    });
  }
}
