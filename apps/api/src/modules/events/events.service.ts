import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { CreateEventDto, EventResponseDto, EventListResponseDto } from './dto/create-event.dto.js';
import type { UpdateEventDto } from './dto/update-event.dto.js';

const TITLE_MIN = 1;
const TITLE_MAX = 200;

interface EventRow {
  id: string;
  householdId: string;
  title: string;
  description: string | null;
  startTime: Date;
  endTime: Date;
  allDay: boolean;
  location: string | null;
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
}

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Authorization helpers ----

  /** Returns the actor's role in the household, or null if not a member. */
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

  /** Returns true if the actor can edit/delete the event. */
  private canMutate(actorRole: 'OWNER' | 'ADMIN' | 'MEMBER', eventCreatorId: string, actorId: string): boolean {
    if (actorRole === 'MEMBER') return eventCreatorId === actorId;
    return true; // OWNER or ADMIN
  }

  // ---- CRUD ----

  async create(
    actorId: string,
    householdId: string,
    input: CreateEventDto,
  ): Promise<EventResponseDto> {
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

    const start = new Date(input.startTime);
    const end = new Date(input.endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        details: [{ field: 'startTime/endTime', codes: ['invalid_date'] }],
      });
    }
    if (end <= start) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        details: [{ field: 'endTime', codes: ['must_be_after_start'], message: 'End time must be after start time.' }],
      });
    }

    const event = await this.prisma.event.create({
      data: {
        householdId,
        title: trimmedTitle,
        description: input.description?.trim() || null,
        startTime: start,
        endTime: end,
        allDay: input.allDay ?? false,
        location: input.location?.trim() || null,
        createdBy: actorId,
      },
      include: { labels: { include: { label: true } } },
    });

    return this.toResponse(event);
  }

  async list(
    actorId: string,
    householdId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<EventListResponseDto> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });

    const where: Record<string, unknown> = { householdId };
    if (startDate || endDate) {
      const startTime: Record<string, Date> = {};
      if (startDate) {
        // startDate is the client's local date (e.g. "2026-08-06").
        // new Date("YYYY-MM-DD") creates midnight *UTC*, but an event
        // whose local start is on startDate may have a UTC timestamp
        // on the previous calendar day when the client is in a positive
        // UTC offset (e.g. CST = UTC+8 → local midnight = 16:00Z the
        // day before). Subtract one UTC day so those events are captured.
        const startUtc = new Date(startDate);
        startUtc.setUTCDate(startUtc.getUTCDate() - 1);
        startTime.gte = startUtc;
      }
      if (endDate) {
        // endDate is inclusive (the last day to include). Advance by one
        // day and use < so events whose startTime falls anywhere on
        // endDate are captured, not just those at midnight UTC.
        const endExclusive = new Date(endDate);
        endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
        startTime.lt = endExclusive;
      }
      where.startTime = startTime;
    }

    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where: where as any,
        orderBy: { startTime: 'asc' },
        include: { labels: { include: { label: true } } },
      }),
      this.prisma.event.count({ where: where as any }),
    ]);

    return {
      events: events.map((e) => this.toResponse(e)),
      total,
    };
  }

  async getById(
    actorId: string,
    householdId: string,
    eventId: string,
  ): Promise<EventResponseDto> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { labels: { include: { label: true } } },
    });
    if (event === null || event.householdId !== householdId) {
      throw new NotFoundException({ code: 'EVENT_NOT_FOUND', message: 'Event not found.' });
    }
    return this.toResponse(event);
  }

  async update(
    actorId: string,
    householdId: string,
    eventId: string,
    input: UpdateEventDto,
  ): Promise<EventResponseDto> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });

    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (event === null || event.householdId !== householdId) {
      throw new NotFoundException({ code: 'EVENT_NOT_FOUND', message: 'Event not found.' });
    }

    if (!this.canMutate(role, event.createdBy, actorId)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only the event creator, admin, or owner can edit this event.' });
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
    if (input.description !== undefined) data.description = input.description?.trim() || null;
    if (input.startTime !== undefined) data.startTime = new Date(input.startTime);
    if (input.endTime !== undefined) data.endTime = new Date(input.endTime);
    if (input.allDay !== undefined) data.allDay = input.allDay;
    if (input.location !== undefined) data.location = input.location?.trim() || null;

    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data,
      include: { labels: { include: { label: true } } },
    });

    return this.toResponse(updated);
  }

  async delete(
    actorId: string,
    householdId: string,
    eventId: string,
  ): Promise<void> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });

    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (event === null || event.householdId !== householdId) {
      throw new NotFoundException({ code: 'EVENT_NOT_FOUND', message: 'Event not found.' });
    }

    if (!this.canMutate(role, event.createdBy, actorId)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only the event creator, admin, or owner can delete this event.' });
    }

    await this.prisma.event.delete({ where: { id: eventId } });
  }

  // ---- Mapping ----

  private toResponse(row: EventRow): EventResponseDto {
    return {
      id: row.id,
      householdId: row.householdId,
      title: row.title,
      description: row.description,
      startTime: row.startTime.toISOString(),
      endTime: row.endTime.toISOString(),
      allDay: row.allDay,
      location: row.location,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      labels: row.labels.map((el) => ({
        id: el.label.id,
        householdId: el.label.householdId,
        name: el.label.name,
        color: el.label.color,
        createdBy: el.label.createdBy,
        createdAt: el.label.createdAt.toISOString(),
      })),
    };
  }
}
