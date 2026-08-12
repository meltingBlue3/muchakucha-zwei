import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { RecurrenceMaterializerService } from './recurrence-materializer.service.js';
import { addDays, formatIsoDate, parseIsoDate } from './recurrence-date.js';
import type { SeriesScope, UpdateSeriesDto } from './dto/recurrence.dto.js';

type TransactionClient = Prisma.TransactionClient;
type RecurrenceKind = 'event' | 'task';
type ActorRole = 'OWNER' | 'ADMIN' | 'MEMBER';

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
            : recurrence.endsOn === undefined ? null : new Date(`${recurrence.endsOn}T00:00:00.000Z`),
          count: recurrence === undefined ? inheritedCount : recurrence.count ?? null,
          timezone: recurrence?.timezone ?? occurrence.rule.timezone,
          startTimeLocal: recurrence?.startTimeLocal ?? occurrence.rule.startTimeLocal,
          durationMinutes: recurrence?.durationMinutes ?? occurrence.rule.durationMinutes,
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
            labels: { create: template.labels.map(({ labelId }) => ({ labelId })) },
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
            labels: { create: template.labels.map(({ labelId }) => ({ labelId })) },
          },
        });
      }
      return createdRule.id;
    });

    await this.materializer.materializeRule(newRuleId);
    return { recurrenceRuleId: newRuleId };
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
      const splitCalendarDate = parseIsoDate(occurrence.occurrenceDate.toISOString().slice(0, 10));
      await tx.recurrenceRule.update({
        where: { id: occurrence.rule.id },
        data: {
          endsOn: new Date(`${formatIsoDate(addDays(splitCalendarDate, -1))}T00:00:00.000Z`),
          count: null,
        },
      });
      if (kind === 'task') {
        await tx.task.deleteMany({
          where: { recurrenceRuleId: occurrence.rule.id, occurrenceDate: { gte: occurrence.occurrenceDate } },
        });
      } else {
        await tx.event.deleteMany({
          where: { recurrenceRuleId: occurrence.rule.id, occurrenceDate: { gte: occurrence.occurrenceDate } },
        });
      }
    });
  }
}
