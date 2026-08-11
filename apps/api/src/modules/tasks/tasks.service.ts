import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type {
  CreateTaskDto,
  TaskPriority,
  TaskResponseDto,
  TaskStatus,
  TaskListResponseDto,
} from './dto/create-task.dto.js';
import type { UpdateTaskDto } from './dto/update-task.dto.js';

const TITLE_MIN = 1;
const TITLE_MAX = 200;
const VALID_STATUSES: TaskStatus[] = ['pending', 'in_progress', 'completed'];
const VALID_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

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
  constructor(private readonly prisma: PrismaService) {}

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

    const task = await this.prisma.task.create({
      data: {
        householdId,
        title: trimmedTitle,
        description: input.description?.trim() || null,
        status: input.status ?? 'pending',
        priority: input.priority ?? 'medium',
        dueDate,
        createdBy: actorId,
        assignees: { create: assigneeIds.map((userId) => ({ userId })) },
      },
      include: { labels: { include: { label: true } }, assignees: true },
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

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where: where as any,
        orderBy: [{ priority: 'asc' }, { dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        include: { labels: { include: { label: true } }, assignees: true },
      }),
      this.prisma.task.count({ where: where as any }),
    ]);

    return {
      tasks: tasks.map((t) => this.toResponse(t)),
      total,
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
      include: { labels: { include: { label: true } }, assignees: true },
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
      if (!VALID_STATUSES.includes(input.status as TaskStatus)) {
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
      include: { labels: { include: { label: true } }, assignees: true },
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
