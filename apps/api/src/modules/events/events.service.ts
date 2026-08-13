import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { CreateEventDto, EventResponseDto, EventListResponseDto } from './dto/create-event.dto.js';
import type { UpdateEventDto } from './dto/update-event.dto.js';
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

/** UTC midnight for "today" — the boundary IN-04's ended-rule filter uses. */
function utcMidnightToday(): Date {
  return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
}

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
  recurrenceRuleId: string | null;
  occurrenceDate: Date | null;
  cancelledAt: Date | null;
  recurrenceRule: {
    id: string;
    freq: string;
    interval: number;
    byWeekday: number[];
    startsOn: Date;
    endsOn: Date | null;
    count: number | null;
    timezone: string;
    materializedThrough: Date | null;
    startTimeLocal: string | null;
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
}

interface ListFilters {
  startDate?: string | undefined;
  endDate?: string | undefined;
  /** Only 'true' or 'false' are honored; any other value is treated as unset (D-15). */
  recurring?: string | undefined;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly materializer: RecurrenceMaterializerService,
  ) {}

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

    if (input.recurrence?.endsOn !== undefined && input.recurrence.count !== undefined) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        details: [{
          field: 'recurrence.endsOn',
          codes: ['ends_on_and_count_mutually_exclusive'],
          message: '结束日期与重复次数只能二选一。',
        }],
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

      const timeParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: recurrence.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(start);
      const hour = Number(timeParts.find((part) => part.type === 'hour')?.value);
      const minute = Number(timeParts.find((part) => part.type === 'minute')?.value);
      const startTimeLocal = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60_000);
      const occurrenceStart = localDateTimeToInstant(firstOccurrence, hour, minute, recurrence.timezone);
      const occurrenceDate = formatIsoDate(firstOccurrence);

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
            startTimeLocal,
            durationMinutes,
            templateTitle: trimmedTitle,
            templateDescription: input.description?.trim() || null,
            templateLocation: input.location?.trim() || null,
            templateAllDay: input.allDay ?? false,
            createdBy: actorId,
          },
        });
        // D-17: this seed row is a deliberate exception to D-11's lookahead —
        // it is written unconditionally, not gated by the horizon check that
        // governs every later occurrence. Removing it would break three
        // things: the materializer discriminates a rule as task-owned vs.
        // event-owned by which relation has an existing row, so a rule with
        // zero rows could never generate again; labels are copied from this
        // row as the fan-out template, so there would be nothing to copy
        // from; and POST's response contract returns this row's id, which
        // the client uses to attach labels immediately after create.
        const template = await tx.event.create({
          data: {
            householdId,
            title: trimmedTitle,
            description: input.description?.trim() || null,
            startTime: occurrenceStart,
            endTime: new Date(occurrenceStart.getTime() + durationMinutes * 60_000),
            allDay: input.allDay ?? false,
            location: input.location?.trim() || null,
            createdBy: actorId,
            recurrenceRuleId: rule.id,
            occurrenceDate: new Date(`${occurrenceDate}T00:00:00.000Z`),
          },
        });
        return { eventId: template.id, ruleId: rule.id };
      });

      // The rule and its first occurrence are already committed. D-03's
      // immediate generation is a latency optimisation, not a correctness
      // invariant — the scheduler catches up — so a transient failure here
      // must not report a 500 for a series that was in fact saved.
      try {
        const materialization = await this.materializer.materializeRule(created.ruleId);
        if (materialization.skipped) {
          this.logger.warn(`rule ${created.ruleId} was locked at create time; the scheduler will generate it`);
        }
      } catch (error: unknown) {
        this.logger.error(`immediate materialization failed for rule ${created.ruleId}`, error);
      }
      const event = await this.prisma.event.findUniqueOrThrow({
        where: { id: created.eventId },
        include: { labels: { include: { label: true } }, recurrenceRule: true },
      });
      return this.toResponse(event);
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
      include: { labels: { include: { label: true } }, recurrenceRule: true },
    });

    return this.toResponse(event);
  }

  async list(
    actorId: string,
    householdId: string,
    filters: ListFilters = {},
  ): Promise<EventListResponseDto> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });

    const { startDate, endDate, recurring } = filters;
    const where: Prisma.EventWhereInput = { householdId, cancelledAt: null };
    if (startDate || endDate) {
      const startTime: Prisma.DateTimeFilter = {};
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
    if (recurring === 'true') where.recurrenceRuleId = { not: null };
    else if (recurring === 'false') where.recurrenceRuleId = null;

    const [events, total, watermark] = await Promise.all([
      this.prisma.event.findMany({
        where,
        orderBy: { startTime: 'asc' },
        include: { labels: { include: { label: true } }, recurrenceRule: true },
      }),
      this.prisma.event.count({ where }),
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
      events: events.map((e) => this.toResponse(e)),
      total,
      materializedThrough: watermark._min.materializedThrough?.toISOString().slice(0, 10) ?? null,
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
      include: { labels: { include: { label: true } }, recurrenceRule: true },
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
      include: { labels: { include: { label: true } }, recurrenceRule: true },
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

    // A generated occurrence must be cancelled, not removed: the generator
    // dedupes on the row itself, so a missing row reads as "not yet
    // generated" and the occurrence would come back on the next tick (D-07).
    if (event.recurrenceRuleId !== null) {
      await this.prisma.event.update({
        where: { id: eventId },
        data: { cancelledAt: new Date() },
      });
      return;
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
      recurrenceRuleId: row.recurrenceRuleId,
      occurrenceDate: row.occurrenceDate?.toISOString().slice(0, 10) ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      recurrence: row.recurrenceRule === null ? null : {
        id: row.recurrenceRule.id,
        freq: row.recurrenceRule.freq,
        interval: row.recurrenceRule.interval,
        byWeekday: row.recurrenceRule.byWeekday,
        startsOn: row.recurrenceRule.startsOn.toISOString().slice(0, 10),
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
