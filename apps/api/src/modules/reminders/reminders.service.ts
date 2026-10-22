import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import {
  addDays,
  compareDates,
  currentCalendarDateIn,
  formatIsoDate,
  localDateTimeToInstant,
  parseIsoDate,
  walkOccurrences,
  type CalendarDate,
} from '../recurrence/recurrence-date.js';
import { writeReminderChoice } from '../shared/reminder-overrides.js';
import type {
  ReminderChoiceDto,
  ReminderSettingsDto,
  UpcomingReminderListDto,
  UpdateReminderSettingsDto,
} from './dto/reminder.dto.js';
import {
  DEFAULT_REMINDER_SETTINGS,
  REMINDER_WINDOW_DAYS,
  planReminders,
  type ReminderCandidate,
  type ReminderDefaults,
} from './reminder-schedule.js';

const DAY_MS = 86_400_000;
const OPEN_TASK_STATUSES = ['pending', 'in_progress'];

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

function assertTimeZone(timeZone: string | undefined): string {
  try {
    if (timeZone === undefined || timeZone === '') throw new RangeError('missing');
    new Intl.DateTimeFormat('en-CA', { timeZone }).format();
    return timeZone;
  } catch {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed.',
      details: [{ field: 'timeZone', codes: ['invalid_time_zone'] }],
    });
  }
}

@Injectable()
export class RemindersService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(userId: string): Promise<ReminderSettingsDto> {
    const [settings, memberships] = await Promise.all([
      this.prisma.reminderSettings.findUnique({ where: { userId } }),
      this.prisma.membership.findMany({
        where: { userId },
        include: { household: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const defaults: ReminderDefaults = settings ?? DEFAULT_REMINDER_SETTINGS;
    return {
      taskMinutesBefore: defaults.taskMinutesBefore,
      eventMinutesBefore: defaults.eventMinutesBefore,
      dateOnlyTime: defaults.dateOnlyTime,
      households: memberships.map(membership => ({
        id: membership.householdId,
        name: membership.household.name,
        muted: membership.remindersMuted,
      })),
    };
  }

  async updateSettings(userId: string, input: UpdateReminderSettingsDto): Promise<ReminderSettingsDto> {
    const muted = [...new Set(input.mutedHouseholdIds)];
    const values = {
      taskMinutesBefore: input.taskMinutesBefore,
      eventMinutesBefore: input.eventMinutesBefore,
      dateOnlyTime: input.dateOnlyTime,
    };
    await this.prisma.$transaction(async (tx) => {
      const memberOf = await tx.membership.count({ where: { userId, householdId: { in: muted } } });
      if (memberOf !== muted.length) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed.',
          details: [{ field: 'mutedHouseholdIds', codes: ['not_member'] }],
        });
      }
      await tx.reminderSettings.upsert({ where: { userId }, create: { userId, ...values }, update: values });
      await tx.membership.updateMany({ where: { userId, householdId: { in: muted } }, data: { remindersMuted: true } });
      await tx.membership.updateMany({ where: { userId, householdId: { notIn: muted } }, data: { remindersMuted: false } });
    });
    return this.getSettings(userId);
  }

  async setReminder(
    userId: string,
    householdId: string,
    kind: 'task' | 'event',
    itemId: string,
    choice: ReminderChoiceDto,
  ): Promise<ReminderChoiceDto> {
    const membership = await this.prisma.membership.findUnique({ where: { userId_householdId: { userId, householdId } } });
    if (membership === null) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });
    const select = { householdId: true, recurrenceRuleId: true } as const;
    const item = kind === 'task'
      ? await this.prisma.task.findUnique({ where: { id: itemId }, select })
      : await this.prisma.event.findUnique({ where: { id: itemId }, select });
    if (item === null || item.householdId !== householdId) {
      throw kind === 'task'
        ? new NotFoundException({ code: 'TASK_NOT_FOUND', message: 'Task not found.' })
        : new NotFoundException({ code: 'EVENT_NOT_FOUND', message: 'Event not found.' });
    }
    return writeReminderChoice(this.prisma, userId, kind, { id: itemId, recurrenceRuleId: item.recurrenceRuleId }, choice);
  }

  /**
   * The reminders this person's phone should hold right now, across every
   * household they have not muted. Series occurrences that have no row yet —
   * a daily series only gets tomorrow's row at its own midnight — are walked
   * from the rule, keyed the same way the row will be once it exists.
   */
  async upcoming(userId: string, requestedTimeZone: string | undefined, now = new Date()): Promise<UpcomingReminderListDto> {
    const timeZone = assertTimeZone(requestedTimeZone);
    const memberships = await this.prisma.membership.findMany({
      where: { userId, remindersMuted: false },
      include: { household: { select: { name: true } } },
    });
    if (memberships.length === 0) return { reminders: [] };
    const householdIds = memberships.map(membership => membership.householdId);
    const householdNames = new Map(memberships.map(membership => [membership.householdId, membership.household.name]));
    const settings = await this.prisma.reminderSettings.findUnique({ where: { userId } });

    // Superset of every due or start time whose reminder can land in the
    // window: up to seven days early, and a date-only item's time can sit a
    // day past its stored midnight.
    const from = new Date(now.getTime() - 2 * DAY_MS);
    const through = new Date(now.getTime() + (2 * REMINDER_WINDOW_DAYS + 2) * DAY_MS);
    const mine = { OR: [{ assignees: { some: { userId } } }, { assignees: { none: {} }, createdBy: userId }] };
    const [tasks, events, rules] = await Promise.all([
      this.prisma.task.findMany({
        where: { householdId: { in: householdIds }, status: { in: OPEN_TASK_STATUSES }, dueDate: { gte: from, lte: through }, ...mine },
        select: { id: true, householdId: true, title: true, dueDate: true, recurrenceRuleId: true, occurrenceDate: true },
      }),
      this.prisma.event.findMany({
        where: { householdId: { in: householdIds }, cancelledAt: null, startTime: { gte: from, lte: through } },
        select: { id: true, householdId: true, title: true, startTime: true, allDay: true, location: true, recurrenceRuleId: true, occurrenceDate: true },
      }),
      this.prisma.recurrenceRule.findMany({
        where: {
          householdId: { in: householdIds },
          AND: [
            { OR: [{ endsOn: null }, { endsOn: { gte: databaseDate(calendarDate(from)) } }] },
            { OR: [{ materializedThrough: null }, { materializedThrough: { lt: databaseDate(calendarDate(through)) } }] },
          ],
        },
        include: {
          // The earliest row is the series' template for assignees, as in the materializer.
          tasks: { orderBy: { occurrenceDate: 'asc' }, take: 1, select: { assignees: { select: { userId: true } } } },
          events: { take: 1, select: { id: true } },
        },
      }),
    ]);

    const candidates: Array<Omit<ReminderCandidate, 'minutesBefore'> & { ruleId: string | null }> = [];
    for (const task of tasks) {
      if (task.dueDate === null) continue;
      const occurrenceDate = task.occurrenceDate === null ? null : formatIsoDate(calendarDate(task.occurrenceDate));
      candidates.push({
        key: task.recurrenceRuleId !== null && occurrenceDate !== null ? `task:${task.recurrenceRuleId}:${occurrenceDate}` : `task:${task.id}`,
        kind: 'task', householdId: task.householdId, householdName: householdNames.get(task.householdId) ?? '',
        itemId: task.id, occurrenceDate, title: task.title, at: task.dueDate, allDay: false, location: null, ruleId: task.recurrenceRuleId,
      });
    }
    for (const event of events) {
      const occurrenceDate = event.occurrenceDate === null ? null : formatIsoDate(calendarDate(event.occurrenceDate));
      candidates.push({
        key: event.recurrenceRuleId !== null && occurrenceDate !== null ? `event:${event.recurrenceRuleId}:${occurrenceDate}` : `event:${event.id}`,
        kind: 'event', householdId: event.householdId, householdName: householdNames.get(event.householdId) ?? '',
        itemId: event.id, occurrenceDate, title: event.title, at: event.startTime, allDay: event.allDay, location: event.location, ruleId: event.recurrenceRuleId,
      });
    }

    const seriesRules = rules.filter(rule => {
      const template = rule.tasks[0];
      if (template !== undefined) {
        return template.assignees.length === 0 ? rule.createdBy === userId : template.assignees.some(assignee => assignee.userId === userId);
      }
      return rule.events.length > 0;
    });
    if (seriesRules.length > 0) {
      const ruleIds = seriesRules.map(rule => rule.id);
      // Rows can exist past the watermark (the seed row, calendar browsing),
      // in any status: a cancelled or completed row must not come back as a
      // walked occurrence.
      const [taskRows, eventRows] = await Promise.all([
        this.prisma.task.findMany({ where: { recurrenceRuleId: { in: ruleIds }, occurrenceDate: { gte: databaseDate(addDays(calendarDate(from), -1)) } }, select: { recurrenceRuleId: true, occurrenceDate: true } }),
        this.prisma.event.findMany({ where: { recurrenceRuleId: { in: ruleIds }, occurrenceDate: { gte: databaseDate(addDays(calendarDate(from), -1)) } }, select: { recurrenceRuleId: true, occurrenceDate: true } }),
      ]);
      const existing = new Set([...taskRows, ...eventRows].flatMap(row => row.occurrenceDate === null ? [] : [`${row.recurrenceRuleId}:${formatIsoDate(calendarDate(row.occurrenceDate))}`]));
      for (const rule of seriesRules) {
        const kind = rule.tasks.length > 0 ? 'task' : 'event';
        const today = currentCalendarDateIn(rule.timezone, now);
        const watermark = rule.materializedThrough === null ? null : addDays(calendarDate(rule.materializedThrough), 1);
        const yesterday = addDays(today, -1);
        const walkFrom = watermark !== null && compareDates(watermark, yesterday) > 0 ? watermark : yesterday;
        const time = localTime(rule.startTimeLocal);
        const occurrences = walkOccurrences({
          freq: rule.freq, interval: rule.interval, byWeekday: rule.byWeekday,
          startsOn: calendarDate(rule.startsOn),
          endsOn: rule.endsOn === null ? null : calendarDate(rule.endsOn), count: rule.count,
        }, { from: walkFrom, horizon: addDays(today, 2 * REMINDER_WINDOW_DAYS + 1) });
        for (const occurrence of occurrences) {
          const occurrenceDate = formatIsoDate(occurrence);
          if (existing.has(`${rule.id}:${occurrenceDate}`)) continue;
          candidates.push({
            key: `${kind}:${rule.id}:${occurrenceDate}`, kind, householdId: rule.householdId,
            householdName: householdNames.get(rule.householdId) ?? '', itemId: null, occurrenceDate,
            title: rule.templateTitle, at: localDateTimeToInstant(occurrence, time.hour, time.minute, rule.timezone),
            allDay: kind === 'event' && rule.templateAllDay, location: kind === 'event' ? rule.templateLocation : null, ruleId: rule.id,
          });
        }
      }
    }

    const ruleIds = [...new Set(candidates.flatMap(candidate => candidate.ruleId === null ? [] : [candidate.ruleId]))];
    const taskIds = candidates.filter(candidate => candidate.kind === 'task' && candidate.ruleId === null).map(candidate => candidate.itemId!);
    const eventIds = candidates.filter(candidate => candidate.kind === 'event' && candidate.ruleId === null).map(candidate => candidate.itemId!);
    const overrides = await this.prisma.reminderOverride.findMany({
      where: { userId, OR: [{ recurrenceRuleId: { in: ruleIds } }, { taskId: { in: taskIds } }, { eventId: { in: eventIds } }] },
    });
    const personal = new Map(overrides.map(override => [override.recurrenceRuleId ?? override.taskId ?? override.eventId, override.minutesBefore]));

    const planned = planReminders(
      candidates.map(({ ruleId, ...candidate }) => {
        const target = ruleId ?? candidate.itemId!;
        return { ...candidate, minutesBefore: personal.has(target) ? personal.get(target) ?? null : undefined };
      }),
      settings ?? DEFAULT_REMINDER_SETTINGS,
      { now, timeZone },
    );
    return {
      reminders: planned.map(reminder => ({
        key: reminder.key,
        kind: reminder.kind,
        householdId: reminder.householdId,
        householdName: reminder.householdName,
        itemId: reminder.itemId,
        occurrenceDate: reminder.occurrenceDate,
        title: reminder.title,
        at: reminder.at.toISOString(),
        dateOnly: reminder.dateOnly,
        fireAt: reminder.fireAt.toISOString(),
        location: reminder.location,
      })),
    };
  }
}
