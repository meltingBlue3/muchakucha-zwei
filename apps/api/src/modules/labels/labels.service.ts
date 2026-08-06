import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { CreateLabelDto, LabelResponseDto, LabelListResponseDto, TagEntitiesDto } from './dto/create-label.dto.js';
import type { UpdateLabelDto } from './dto/create-label.dto.js';

const NAME_MIN = 1;
const NAME_MAX = 40;
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

interface LabelRow {
  id: string;
  householdId: string;
  name: string;
  color: string;
  createdBy: string;
  createdAt: Date;
}

@Injectable()
export class LabelsService {
  constructor(private readonly prisma: PrismaService) {}

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

  private requireAdmin(role: 'OWNER' | 'ADMIN' | 'MEMBER' | null): 'OWNER' | 'ADMIN' {
    if (role === null) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });
    if (role === 'MEMBER') {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only admins and owners can manage labels.' });
    }
    return role;
  }

  private validateColor(color: string): void {
    if (!COLOR_RE.test(color)) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        details: [{ field: 'color', codes: ['invalid'], message: 'Color must be a hex color like #EF4444.' }],
      });
    }
  }

  // ---- Label CRUD ----

  async create(
    actorId: string,
    householdId: string,
    input: CreateLabelDto,
  ): Promise<LabelResponseDto> {
    this.requireAdmin(await this.resolveActorRole(actorId, householdId));

    const name = input.name.trim();
    if (name.length < NAME_MIN || name.length > NAME_MAX) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        details: [{ field: 'name', codes: ['length'] }],
      });
    }

    this.validateColor(input.color);

    // Check uniqueness within household.
    const existing = await this.prisma.label.findUnique({
      where: { householdId_name: { householdId, name } },
    });
    if (existing !== null) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        details: [{ field: 'name', codes: ['duplicate'], message: 'A label with this name already exists in this household.' }],
      });
    }

    const label = await this.prisma.label.create({
      data: { householdId, name, color: input.color, createdBy: actorId },
    });

    return this.toResponse(label);
  }

  async list(
    actorId: string,
    householdId: string,
  ): Promise<LabelListResponseDto> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });

    const [labels, total] = await Promise.all([
      this.prisma.label.findMany({
        where: { householdId },
        orderBy: { name: 'asc' },
      }),
      this.prisma.label.count({ where: { householdId } }),
    ]);

    return {
      labels: labels.map((l) => this.toResponse(l)),
      total,
    };
  }

  async update(
    actorId: string,
    householdId: string,
    labelId: string,
    input: UpdateLabelDto,
  ): Promise<LabelResponseDto> {
    this.requireAdmin(await this.resolveActorRole(actorId, householdId));

    const label = await this.prisma.label.findUnique({ where: { id: labelId } });
    if (label === null || label.householdId !== householdId) {
      throw new NotFoundException({ code: 'LABEL_NOT_FOUND', message: 'Label not found.' });
    }

    const data: Record<string, unknown> = {};

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name.length < NAME_MIN || name.length > NAME_MAX) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed.',
          details: [{ field: 'name', codes: ['length'] }],
        });
      }

      // Check uniqueness if name changed.
      if (name !== label.name) {
        const conflict = await this.prisma.label.findUnique({
          where: { householdId_name: { householdId, name } },
        });
        if (conflict !== null) {
          throw new BadRequestException({
            code: 'VALIDATION_FAILED',
            message: 'Request validation failed.',
            details: [{ field: 'name', codes: ['duplicate'] }],
          });
        }
      }

      data.name = name;
    }

    if (input.color !== undefined) {
      this.validateColor(input.color);
      data.color = input.color;
    }

    const updated = await this.prisma.label.update({ where: { id: labelId }, data });
    return this.toResponse(updated);
  }

  async delete(
    actorId: string,
    householdId: string,
    labelId: string,
  ): Promise<void> {
    this.requireAdmin(await this.resolveActorRole(actorId, householdId));

    const label = await this.prisma.label.findUnique({ where: { id: labelId } });
    if (label === null || label.householdId !== householdId) {
      throw new NotFoundException({ code: 'LABEL_NOT_FOUND', message: 'Label not found.' });
    }

    // Junction rows cascade automatically (onDelete: Cascade on both sides).
    await this.prisma.label.delete({ where: { id: labelId } });
  }

  // ---- Tag / Untag ----

  async tagEvent(
    actorId: string,
    householdId: string,
    eventId: string,
    input: TagEntitiesDto,
  ): Promise<void> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });

    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (event === null || event.householdId !== householdId) {
      throw new NotFoundException({ code: 'EVENT_NOT_FOUND', message: 'Event not found.' });
    }

    // Verify all labels belong to the same household.
    const labels = await this.prisma.label.findMany({
      where: { id: { in: input.labelIds }, householdId },
    });
    if (labels.length !== input.labelIds.length) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        details: [{ field: 'labelIds', codes: ['invalid'], message: 'One or more labels do not belong to this household.' }],
      });
    }

    await this.prisma.$transaction([
      // Remove labels that are no longer selected
      this.prisma.eventLabel.deleteMany({
        where: {
          eventId,
          labelId: { notIn: input.labelIds },
        },
      }),
      // Upsert the currently selected labels
      ...input.labelIds.map((labelId) =>
        this.prisma.eventLabel.upsert({
          where: { eventId_labelId: { eventId, labelId } },
          create: { eventId, labelId },
          update: {},
        }),
      ),
    ]);
  }

  async untagEvent(
    actorId: string,
    householdId: string,
    eventId: string,
    labelId: string,
  ): Promise<void> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });

    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (event === null || event.householdId !== householdId) {
      throw new NotFoundException({ code: 'EVENT_NOT_FOUND', message: 'Event not found.' });
    }

    try {
      await this.prisma.eventLabel.delete({
        where: { eventId_labelId: { eventId, labelId } },
      });
    } catch {
      // Already untagged or doesn't exist — no-op.
    }
  }

  async tagTask(
    actorId: string,
    householdId: string,
    taskId: string,
    input: TagEntitiesDto,
  ): Promise<void> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });

    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (task === null || task.householdId !== householdId) {
      throw new NotFoundException({ code: 'TASK_NOT_FOUND', message: 'Task not found.' });
    }

    const labels = await this.prisma.label.findMany({
      where: { id: { in: input.labelIds }, householdId },
    });
    if (labels.length !== input.labelIds.length) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        details: [{ field: 'labelIds', codes: ['invalid'], message: 'One or more labels do not belong to this household.' }],
      });
    }

    await this.prisma.$transaction([
      // Remove labels that are no longer selected
      this.prisma.taskLabel.deleteMany({
        where: {
          taskId,
          labelId: { notIn: input.labelIds },
        },
      }),
      // Upsert the currently selected labels
      ...input.labelIds.map((labelId) =>
        this.prisma.taskLabel.upsert({
          where: { taskId_labelId: { taskId, labelId } },
          create: { taskId, labelId },
          update: {},
        }),
      ),
    ]);
  }

  async untagTask(
    actorId: string,
    householdId: string,
    taskId: string,
    labelId: string,
  ): Promise<void> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });

    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (task === null || task.householdId !== householdId) {
      throw new NotFoundException({ code: 'TASK_NOT_FOUND', message: 'Task not found.' });
    }

    try {
      await this.prisma.taskLabel.delete({
        where: { taskId_labelId: { taskId, labelId } },
      });
    } catch {
      // Already untagged — no-op.
    }
  }

  private toResponse(row: LabelRow): LabelResponseDto {
    return {
      id: row.id,
      householdId: row.householdId,
      name: row.name,
      color: row.color,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
