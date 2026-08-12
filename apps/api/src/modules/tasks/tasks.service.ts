import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type {
  CreateTaskDto,
  TaskPriority,
  TaskResponseDto,
  TaskStatus,
  TaskListResponseDto,
} from './dto/create-task.dto.js';
import { TASK_STATUSES } from './dto/create-task.dto.js';
import type { UpdateTaskDto } from './dto/update-task.dto.js';
import { RecurrenceMaterializerService } from '../recurrence/recurrence-materializer.service.js';
import {
  addDays,
  formatIsoDate,
  localDateTimeToInstant,
  parseIsoDate,
  walkOccurrences,
} from '../recurrence/recurrence-date.js';

const TITLE_MIN = 1;
const TITLE_MAX = 200;
const VALID_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

/** UTC midnight for "today" — the boundary IN-04's ended-rule filter uses. */
function utcMidnightToday(): Date {
  return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
}

interface TaskRow {
  id: string;
  householdId: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  recurrenceRuleId: string | null;
  occurrenceDate: Date | null;
  recurrenceRule: {
    id: string; freq: string; interval: number; byWeekday: number[]; startsOn: Date; endsOn: Date | null;
    count: number | null; timezone: string; materializedThrough: Date | null; startTimeLocal: string | null;
    durationMinutes: number | null;
  } | null;
  labels: Array<{
    label: {
      id: string;
      householdId: string;
      name: string;
      color: string;
      createdBy: string;
      createdAt: Date;
    };
  }>;
  assignees: Array<{ userId: string }>;
}

interface ListFilters {
  status?: string | undefined;
  priority?: string | undefined;
  assigneeId?: string | undefined;
}

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly materializer: RecurrenceMaterializerService,
  ) {}

  // ---- Authorization helpers ----

  private async resolveActorRole(
    actorId: string,
    householdId: string,
  ): Promise<'OWNER' | 'ADMIN' | 'MEMBER' | null> {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_householdId: { userId: actorId, householdId } },
      include: { household: { select: { ownerMembershipId: true } } },
    });
    if (membership === null) return null;
    if (membership.id === membership.household.ownerMembershipId) return 'OWNER';
    return membership.role as 'ADMIN' | 'MEMBER';
  }

  private canMutate(actorRole: 'OWNER' | 'ADMIN' | 'MEMBER', taskCreatorId: string, actorId: string): boolean {
    if (actorRole === 'MEMBER') return taskCreatorId === actorId;
    return true; // OWNER or ADMIN
  }

  private async validateAssigneeIds(householdId: string, assigneeIds: string[]): Promise<void> {
    if (assigneeIds.length === 0) return;
    const memberships = await this.prisma.membership.findMany({
      where: { householdId, userId: { in: assigneeIds } },
    });
    if (memberships.length !== new Set(assigneeIds).size) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        details: [{ field: 'assigneeIds', codes: ['not_household_member'], message: 'All assignees must be household members.' }],
      });
    }
  }

  // ---- CRUD ----

  async create(
    actorId: string,
    householdId: string,
    input: CreateTaskDto,
  ): Promise<TaskResponseDto> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });

    const trimmedTitle = input.title.trim();
    if (trimmedTitle.length < TITLE_MIN || trimmedTitle.length > TITLE_MAX) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        details: [{ field: 'title', codes: ['length'], message: `Title must be ${TITLE_MIN}–${TITLE_MAX} characters.` }],
      });
    }

    // Validate assignees are household members
    const assigneeIds = [...new Set(input.assigneeIds ?? [])];
    await this.validateAssigneeIds(householdId, assigneeIds);

    // Validate dueDate
    let dueDate: Date | null = null;
    if (input.dueDate) {
      dueDate = new Date(input.dueDate);
      if (isNaN(dueDate.getTime())) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed.',
          details: [{ field: 'dueDate', codes: ['invalid_date'] }],
        });
      }
    }

    if (input.recurrence?.endsOn !== undefined && input.recurrence.count !== undefined) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        details: [{ field: 'recurrence.endsOn', codes: ['ends_on_and_count_mutually_exclusive'], message: '结束日期与重复次数只能二选一。' }],
      });
    }

    if (input.recurrence !== undefined) {
      const recurrence = input.recurrence;
      const startsOn = parseIsoDate(recurrence.startsOn);
      const interval = recurrence.interval ?? 1;
      const firstOccurrence = walkOccurrences({
        freq: recurrence.freq,
        interval,
        byWeekday: recurrence.byWeekday ?? [],
        startsOn,
        endsOn: recurrence.endsOn === undefined ? null : parseIsoDate(recurrence.endsOn),
        count: recurrence.count ?? null,
      }, { horizon: addDays(startsOn, Math.max(7, interval * 7)) })[0];
      if (firstOccurrence === undefined) {
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
      const firstOccurrenceIso = formatIsoDate(firstOccurrence);
      const startTime = recurrence.startTimeLocal ?? null;
      const hour = startTime === null ? 0 : Number(startTime.slice(0, 2));
      const minute = startTime === null ? 0 : Number(startTime.slice(3, 5));
      const created = await this.prisma.$transaction(async (tx) => {
        const rule = await tx.recurrenceRule.create({
          data: {
            householdId,
            freq: recurrence.freq,
            interval,
            byWeekday: recurrence.byWeekday ?? [],
            startsOn: new Date(`${recurrence.startsOn}T00:00:00.000Z`),
            endsOn: recurrence.endsOn === undefined ? null : new Date(`${recurrence.endsOn}T00:00:00.000Z`),
            count: recurrence.count ?? null,
            timezone: recurrence.timezone,
            startTimeLocal: startTime,
            durationMinutes: recurrence.durationMinutes ?? null,
            templateTitle: trimmedTitle,
            templateDescription: input.description?.trim() || null,
            templatePriority: input.priority ?? 'medium',
            createdBy: actorId,
          },
        });
        // D-17: this seed row is a deliberate exception to D-11's lookahead —
        // it is written unconditionally, not gated by the horizon check that
        // governs every later occurrence. Removing it would break three
        // things: the materializer discriminates a rule as task-owned vs.
        // event-owned by which relation has an existing row, so a rule with
        // zero rows could never generate again; assignees/labels are copied
        // from this row as the fan-out template, so there would be nothing
        // to copy from; and POST's response contract returns this row's id,
        // which the client uses to attach labels immediately after create.
        const task = await tx.task.create({
          data: {
            householdId,
            title: trimmedTitle,
            description: input.description?.trim() || null,
            status: input.status ?? 'pending',
            priority: input.priority ?? 'medium',
            dueDate: localDateTimeToInstant(firstOccurrence, hour, minute, recurrence.timezone),
            createdBy: actorId,
            recurrenceRuleId: rule.id,
            occurrenceDate: new Date(`${firstOccurrenceIso}T00:00:00.000Z`),
            assignees: { create: assigneeIds.map((userId) => ({ userId })) },
          },
        });
        return { taskId: task.id, ruleId: rule.id };
      });
      // See EventsService.create: the series is already committed, so a
      // transient materialization failure must not surface as a 500.
      try {
        const materialization = await this.materializer.materializeRule(created.ruleId);
        if (materialization.skipped) {
          this.logger.warn(`rule ${created.ruleId} was locked at create time; the scheduler will generate it`);
        }
      } catch (error: unknown) {
        this.logger.error(`immediate materialization failed for rule ${created.ruleId}`, error);
      }
      const task = await this.prisma.task.findUniqueOrThrow({
        where: { id: created.taskId },
        include: { labels: { include: { label: true } }, assignees: true, recurrenceRule: true },
      });
      return this.toResponse(task);
    }

    const task = await this.prisma.task.create({
      data: { householdId, title: trimmedTitle, description: input.description?.trim() || null, status: input.status ?? 'pending', priority: input.priority ?? 'medium', dueDate, createdBy: actorId, assignees: { create: assigneeIds.map((userId) => ({ userId })) } },
      include: { labels: { include: { label: true } }, assignees: true, recurrenceRule: true },
    });

    return this.toResponse(task);
  }

  async list(
    actorId: string,
    householdId: string,
    filters: ListFilters = {},
  ): Promise<TaskListResponseDto> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });

    const where: Record<string, unknown> = { householdId };
    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.assigneeId) where.assignees = { some: { userId: filters.assigneeId } };

    const [tasks, total, watermark] = await Promise.all([
      this.prisma.task.findMany({
        where: where as any,
        orderBy: [{ priority: 'asc' }, { dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        include: { labels: { include: { label: true } }, assignees: true, recurrenceRule: true },
      }),
      this.prisma.task.count({ where: where as any }),
      // D-13's monotonic watermark means an ended rule's watermark is frozen
      // in the past forever. Counting it into the household _min would
      // permanently under-report generation coverage for every rule that is
      // still active — scope the aggregate to rules that can still advance.
      this.prisma.recurrenceRule.aggregate({
        _min: { materializedThrough: true },
        where: { householdId, OR: [{ endsOn: null }, { endsOn: { gte: utcMidnightToday() } }] },
      }),
    ]);

    return {
      tasks: tasks.map((t) => this.toResponse(t)),
      total,
      materializedThrough: watermark._min.materializedThrough?.toISOString().slice(0, 10) ?? null,
    };
  }

  async getById(
    actorId: string,
    householdId: string,
    taskId: string,
  ): Promise<TaskResponseDto> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });

    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { labels: { include: { label: true } }, assignees: true, recurrenceRule: true },
    });
    if (task === null || task.householdId !== householdId) {
      throw new NotFoundException({ code: 'TASK_NOT_FOUND', message: 'Task not found.' });
    }
    return this.toResponse(task);
  }

  async update(
    actorId: string,
    householdId: string,
    taskId: string,
    input: UpdateTaskDto,
  ): Promise<TaskResponseDto> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });

    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (task === null || task.householdId !== householdId) {
      throw new NotFoundException({ code: 'TASK_NOT_FOUND', message: 'Task not found.' });
    }

    if (!this.canMutate(role, task.createdBy, actorId)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only the task creator, admin, or owner can edit this task.',
      });
    }

    const data: Record<string, unknown> = {};

    if (input.title !== undefined) {
      const trimmed = input.title.trim();
      if (trimmed.length < TITLE_MIN || trimmed.length > TITLE_MAX) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed.',
          details: [{ field: 'title', codes: ['length'] }],
        });
      }
      data.title = trimmed;
    }

    if (input.description !== undefined) {
      data.description = input.description?.trim() || null;
    }

    if (input.status !== undefined) {
      if (!TASK_STATUSES.includes(input.status as TaskStatus)) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed.',
          details: [{ field: 'status', codes: ['invalid'] }],
        });
      }
      data.status = input.status;
    }

    if (input.priority !== undefined) {
      if (!VALID_PRIORITIES.includes(input.priority as TaskPriority)) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed.',
          details: [{ field: 'priority', codes: ['invalid'] }],
        });
      }
      data.priority = input.priority;
    }

    let nextAssigneeIds: string[] | null = null;
    if (input.assigneeIds !== undefined) {
      nextAssigneeIds = [...new Set(input.assigneeIds)];
      await this.validateAssigneeIds(householdId, nextAssigneeIds);
    }

    if (input.dueDate !== undefined) {
      if (input.dueDate === null || input.dueDate === '') {
        data.dueDate = null;
      } else {
        const parsed = new Date(input.dueDate);
        if (isNaN(parsed.getTime())) {
          throw new BadRequestException({
            code: 'VALIDATION_FAILED',
            message: 'Request validation failed.',
            details: [{ field: 'dueDate', codes: ['invalid_date'] }],
          });
        }
        data.dueDate = parsed;
      }
    }

    if (nextAssigneeIds !== null) {
      const assigneeIds = nextAssigneeIds;
      await this.prisma.$transaction([
        // Remove assignees that are no longer selected
        this.prisma.taskAssignee.deleteMany({
          where: { taskId, userId: { notIn: assigneeIds } },
        }),
        // Upsert the currently selected assignees
        ...assigneeIds.map((userId) =>
          this.prisma.taskAssignee.upsert({
            where: { taskId_userId: { taskId, userId } },
            create: { taskId, userId },
            update: {},
          }),
        ),
      ]);
    }

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data,
      include: { labels: { include: { label: true } }, assignees: true, recurrenceRule: true },
    });

    return this.toResponse(updated);
  }

  async delete(
    actorId: string,
    householdId: string,
    taskId: string,
  ): Promise<void> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });

    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (task === null || task.householdId !== householdId) {
      throw new NotFoundException({ code: 'TASK_NOT_FOUND', message: 'Task not found.' });
    }

    if (!this.canMutate(role, task.createdBy, actorId)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only the task creator, admin, or owner can delete this task.',
      });
    }

    // A generated occurrence must be cancelled, not removed: the generator
    // dedupes on the row itself, so a missing row reads as "not yet
    // generated" and the occurrence would come back on the next tick (D-07).
    if (task.recurrenceRuleId !== null) {
      await this.prisma.task.update({
        where: { id: taskId },
        data: { status: 'cancelled' },
      });
      return;
    }

    await this.prisma.task.delete({ where: { id: taskId } });
  }

  // ---- Mapping ----

  private toResponse(row: TaskRow): TaskResponseDto {
    return {
      id: row.id,
      householdId: row.householdId,
      title: row.title,
      description: row.description,
      status: row.status as TaskStatus,
      priority: row.priority as TaskPriority,
      assigneeIds: row.assignees.map((a) => a.userId),
      dueDate: row.dueDate?.toISOString() ?? null,
      recurrenceRuleId: row.recurrenceRuleId,
      occurrenceDate: row.occurrenceDate?.toISOString().slice(0, 10) ?? null,
      recurrence: row.recurrenceRule === null ? null : {
        id: row.recurrenceRule.id,
        freq: row.recurrenceRule.freq,
        interval: row.recurrenceRule.interval,
        byWeekday: row.recurrenceRule.byWeekday,
        startsOn: formatIsoDate(parseIsoDate(row.recurrenceRule.startsOn.toISOString().slice(0, 10))),
        endsOn: row.recurrenceRule.endsOn?.toISOString().slice(0, 10) ?? null,
        count: row.recurrenceRule.count,
        timezone: row.recurrenceRule.timezone,
        materializedThrough: row.recurrenceRule.materializedThrough?.toISOString().slice(0, 10) ?? null,
        startTimeLocal: row.recurrenceRule.startTimeLocal,
        durationMinutes: row.recurrenceRule.durationMinutes,
      },
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      labels: row.labels.map((tl) => ({
        id: tl.label.id,
        householdId: tl.label.householdId,
        name: tl.label.name,
        color: tl.label.color,
        createdBy: tl.label.createdBy,
        createdAt: tl.label.createdAt.toISOString(),
      })),
    };
  }
}
