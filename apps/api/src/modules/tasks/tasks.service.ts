import { lockTaskAssignments } from '../shared/task-assignment.js';
import { lockContent, replaceLabels } from '../shared/edit-version.js';
import { readReminderChoice, readReminderChoices, writeReminderChoice } from '../shared/reminder-overrides.js';
import type { ReminderChoiceDto } from '../reminders/dto/reminder.dto.js';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
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
import type { RecurrenceDto } from '../recurrence/dto/recurrence.dto.js';
import {
  formatIsoDate,
  localDateTimeToInstant,
  parseIsoDate,
  firstOccurrence as firstOccurrenceOf,
} from '../recurrence/recurrence-date.js';
import { resolveSeriesMarks, seriesMarksResponse } from '../recurrence/series-marks.js';

const TITLE_MIN = 1;
const TITLE_MAX = 200;
const VALID_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

/** UTC midnight for "today" — the boundary IN-04's ended-rule filter uses. */
function utcMidnightToday(): Date {
  return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
}

// WR-02: parseIsoDate throws a plain Error (not an HttpException) on a
// regex-valid but non-existent calendar date ("2026-02-30", "2026-13-45"),
// which StableHttpExceptionFilter maps to a 500. Request-supplied recurrence
// dates must go through this wrapper instead, so a malformed request stays
// a 400. Matches recurrence.service.ts's copy — deliberately duplicated
// rather than imported, same rationale as this file's other local helpers.
function parseRequestDate(value: string, field: string): ReturnType<typeof parseIsoDate> {
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
    count: number | null; timezone: string; materializedThrough: Date | null; updatedAt: Date; startTimeLocal: string | null;
    durationMinutes: number | null; lunarMonth: number | null; lunarDay: number | null; occasion: string | null;
    birthYear: number | null;
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
  /** Only 'true' or 'false' are honored; any other value is treated as unset (D-15). */
  recurring?: string | undefined;
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

  private async validateAssigneeIds(tx: Prisma.TransactionClient, householdId: string, assigneeIds: string[]): Promise<void> {
    if (assigneeIds.length === 0) return;
    const memberships = await tx.membership.findMany({
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

    // Membership validation runs inside the assignment transaction below.
    const assigneeIds = [...new Set(input.assigneeIds ?? [])];

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

    // WR-13: a recurring task's per-occurrence dueDate is always derived
    // from the rule's own walk (below), never from this top-level field —
    // it was previously validated then silently discarded, so a caller
    // that submitted one got a 201 with no indication it was ignored.
    // Reject the combination instead; the client already hides the field
    // once recurrence is selected (see task-form.tsx).
    if (input.recurrence !== undefined && input.dueDate) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        details: [{ field: 'dueDate', codes: ['not_allowed_with_recurrence'] }],
      });
    }

    if (input.recurrence !== undefined) {
      const plan = this.seriesPlan(input.recurrence);
      const created = await this.prisma.$transaction(async (tx) => {
        await lockTaskAssignments(tx, householdId);
        await this.validateAssigneeIds(tx, householdId, assigneeIds);
        const rule = await tx.recurrenceRule.create({
          data: {
            householdId,
            ...plan.rule,
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
            dueDate: plan.dueDate,
            createdBy: actorId,
            recurrenceRuleId: rule.id,
            occurrenceDate: plan.occurrenceDate,
            assignees: { create: assigneeIds.map((userId) => ({ userId })) },
          },
        });
        if (input.myReminder !== undefined) {
          await writeReminderChoice(tx, actorId, 'task', { id: task.id, recurrenceRuleId: rule.id }, input.myReminder);
        }
        return { taskId: task.id, ruleId: rule.id };
      });
      await this.generateNewSeries(created.ruleId);
      const task = await this.prisma.task.findUniqueOrThrow({
        where: { id: created.taskId },
          include: { labels: { include: { label: true } }, assignees: true, recurrenceRule: true },
      });
      return this.toResponse(task, await readReminderChoice(this.prisma, actorId, 'task', task));
    }

    const task = await this.prisma.$transaction(async (tx) => {
      await lockTaskAssignments(tx, householdId);
      await this.validateAssigneeIds(tx, householdId, assigneeIds);
      const created = await tx.task.create({
        data: { householdId, title: trimmedTitle, description: input.description?.trim() || null, status: input.status ?? 'pending', priority: input.priority ?? 'medium', dueDate, createdBy: actorId, assignees: { create: assigneeIds.map((userId) => ({ userId })) } },
        include: { labels: { include: { label: true } }, assignees: true, recurrenceRule: true },
      });
      if (input.myReminder !== undefined) {
        await writeReminderChoice(tx, actorId, 'task', created, input.myReminder);
      }
      return created;
    });

    return this.toResponse(task, await readReminderChoice(this.prisma, actorId, 'task', task));
  }

  async list(
    actorId: string,
    householdId: string,
    filters: ListFilters = {},
  ): Promise<TaskListResponseDto> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });

    const where: Prisma.TaskWhereInput = { householdId };
    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.assigneeId) where.assignees = { some: { userId: filters.assigneeId } };
    if (filters.recurring === 'true') where.recurrenceRuleId = { not: null };
    else if (filters.recurring === 'false') where.recurrenceRuleId = null;

    const [tasks, watermark] = await Promise.all([
      this.prisma.task.findMany({
        where,
        orderBy: [{ priority: 'asc' }, { dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        include: { labels: { include: { label: true } }, assignees: true, recurrenceRule: true },
      }),
      // D-13's monotonic watermark means an ended rule's watermark is frozen
      // in the past forever. Counting it into the household _min would
      // permanently under-report generation coverage for every rule that is
      // still active — scope the aggregate to rules that can still advance.
      this.prisma.recurrenceRule.aggregate({
        _min: { materializedThrough: true },
        where: { householdId, OR: [{ endsOn: null }, { endsOn: { gte: utcMidnightToday() } }] },
      }),
    ]);

    const reminders = await readReminderChoices(this.prisma, actorId, 'task', tasks);
    return {
      tasks: tasks.map((t) => this.toResponse(t, reminders.get(t.id)!)),
      total: tasks.length,
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
    return this.toResponse(task, await readReminderChoice(this.prisma, actorId, 'task', task));
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

    // Adding a repeat to a one-time task makes this row the first occurrence
    // of the series create would have made, due when the rule says: the edit
    // form sends the old due date along. An occurrence that already has a
    // series ignores `recurrence`: a this-only edit sends the form's value
    // along, and series changes go through /series.
    const plan = input.recurrence != null && task.recurrenceRuleId === null ? this.seriesPlan(input.recurrence) : null;
    if (plan !== null) data.dueDate = plan.dueDate;

    const updated = await this.prisma.$transaction(async (tx) => {
      await lockTaskAssignments(tx, householdId);
      const updatedAt = await lockContent(tx, 'task', householdId, taskId, input);
      if (nextAssigneeIds !== null) {
        await this.validateAssigneeIds(tx, householdId, nextAssigneeIds);
        await tx.taskAssignee.deleteMany({ where: { taskId } });
        await tx.taskAssignee.createMany({ data: nextAssigneeIds.map(userId => ({ taskId, userId })) });
      }
      await replaceLabels(tx, 'task', householdId, taskId, input.labelIds);
      if (plan !== null) {
        const template = { ...task, ...data } as typeof task;
        const rule = await tx.recurrenceRule.create({
          data: {
            householdId,
            ...plan.rule,
            templateTitle: template.title,
            templateDescription: template.description,
            templatePriority: template.priority,
            // The series stays with whoever owns the task, so the same people may manage its occurrences.
            createdBy: task.createdBy,
          },
        });
        // Everyone's reminder on a recurring occurrence lives on its series.
        await tx.reminderOverride.updateMany({ where: { taskId }, data: { taskId: null, recurrenceRuleId: rule.id } });
        Object.assign(data, { recurrenceRuleId: rule.id, occurrenceDate: plan.occurrenceDate });
      }
      return tx.task.update({
        where: { id: taskId }, data: { ...data, updatedAt },
          include: { labels: { include: { label: true } }, assignees: true, recurrenceRule: true },
      });
    });

    if (plan === null) return this.toResponse(updated, await readReminderChoice(this.prisma, actorId, 'task', updated));
    await this.generateNewSeries(updated.recurrenceRuleId!);
    const converted = await this.prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      include: { labels: { include: { label: true } }, assignees: true, recurrenceRule: true },
    });
    return this.toResponse(converted, await readReminderChoice(this.prisma, actorId, 'task', converted));
  }

  /**
   * Checks a repeat for a task and works out its rule and first occurrence.
   * Create and an edit that adds a repeat both use it, so a converted task
   * becomes the series create would have made.
   */
  private seriesPlan(recurrence: RecurrenceDto) {
    if (recurrence.endsOn !== undefined && recurrence.count !== undefined) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        details: [{ field: 'recurrence.endsOn', codes: ['ends_on_and_count_mutually_exclusive'], message: '结束日期与重复次数只能二选一。' }],
      });
    }
    const marks = resolveSeriesMarks(recurrence, null);
    const startsOn = parseRequestDate(recurrence.startsOn, 'recurrence.startsOn');
    const interval = recurrence.interval ?? 1;
    const firstOccurrence = firstOccurrenceOf({
      freq: recurrence.freq,
      interval,
      byWeekday: recurrence.byWeekday ?? [],
      startsOn,
      endsOn: recurrence.endsOn === undefined ? null : parseRequestDate(recurrence.endsOn, 'recurrence.endsOn'),
      count: recurrence.count ?? null,
      lunar: recurrence.lunar ?? null,
    });
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
    const startTime = recurrence.startTimeLocal ?? null;
    const hour = startTime === null ? 0 : Number(startTime.slice(0, 2));
    const minute = startTime === null ? 0 : Number(startTime.slice(3, 5));
    return {
      dueDate: localDateTimeToInstant(firstOccurrence, hour, minute, recurrence.timezone),
      occurrenceDate: new Date(`${formatIsoDate(firstOccurrence)}T00:00:00.000Z`),
      rule: {
        freq: recurrence.freq,
        interval,
        byWeekday: recurrence.byWeekday ?? [],
        startsOn: new Date(`${recurrence.startsOn}T00:00:00.000Z`),
        endsOn: recurrence.endsOn === undefined ? null : new Date(`${recurrence.endsOn}T00:00:00.000Z`),
        count: recurrence.count ?? null,
        timezone: recurrence.timezone,
        startTimeLocal: startTime,
        durationMinutes: recurrence.durationMinutes ?? null,
        ...marks,
      },
    };
  }

  // See EventsService.generateNewSeries: the series is already committed, so
  // a transient materialization failure must not surface as a 500.
  private async generateNewSeries(ruleId: string): Promise<void> {
    try {
      const materialization = await this.materializer.materializeRule(ruleId);
      if (materialization.skipped) {
        this.logger.warn(`rule ${ruleId} was locked when first saved; the scheduler will generate it`);
      }
    } catch (error: unknown) {
      this.logger.error(`immediate materialization failed for rule ${ruleId}`, error);
    }
  }

  async delete(
    actorId: string,
    householdId: string,
    taskId: string,
    expected?: { expectedUpdatedAt: string; expectedRuleUpdatedAt?: string },
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
    await this.prisma.$transaction(async (tx) => {
      await lockTaskAssignments(tx, householdId);
      const updatedAt = await lockContent(tx, 'task', householdId, taskId, expected);
      if (task.recurrenceRuleId !== null) {
        await tx.task.update({ where: { id: taskId }, data: { status: 'cancelled', updatedAt } });
      } else {
        await tx.task.delete({ where: { id: taskId } });
      }
    });
  }

  // ---- Mapping ----

  private toResponse(row: TaskRow, myReminder: ReminderChoiceDto): TaskResponseDto {
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
        updatedAt: row.recurrenceRule.updatedAt.toISOString(),
        materializedThrough: row.recurrenceRule.materializedThrough?.toISOString().slice(0, 10) ?? null,
        startTimeLocal: row.recurrenceRule.startTimeLocal,
        durationMinutes: row.recurrenceRule.durationMinutes,
        ...seriesMarksResponse(row.recurrenceRule),
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
      myReminder,
    };
  }
}
