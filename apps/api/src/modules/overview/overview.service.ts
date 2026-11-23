import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { EventsService } from '../events/events.service.js';
import type { EventListResponseDto } from '../events/dto/create-event.dto.js';
import { TasksService } from '../tasks/tasks.service.js';
import type { OverviewHouseholdsDto, OverviewTaskListResponseDto } from './dto/overview.dto.js';

interface EventFilters {
  startDate?: string | undefined;
  endDate?: string | undefined;
  expandRecurring?: string | undefined;
}

/**
 * The 总览 reads across the caller's households; it never widens what they
 * can see. Every household it reads is one the caller belongs to right now,
 * and writes still go through each household's own routes.
 */
@Injectable()
export class OverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly tasks: TasksService,
  ) {}

  /** The households the 总览 shows: the chosen ones, or every one when none is chosen. */
  async householdIds(userId: string): Promise<string[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      select: { householdId: true, inOverview: true },
      orderBy: { createdAt: 'asc' },
    });
    const chosen = memberships.filter((m) => m.inOverview);
    return (chosen.length > 0 ? chosen : memberships).map((m) => m.householdId);
  }

  async update(userId: string, householdIds: string[]): Promise<OverviewHouseholdsDto> {
    const ids = [...new Set(householdIds)];
    await this.prisma.$transaction(async (tx) => {
      const memberOf = await tx.membership.count({ where: { userId, householdId: { in: ids } } });
      if (memberOf !== ids.length) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed.',
          details: [{ field: 'householdIds', codes: ['not_member'] }],
        });
      }
      await tx.membership.updateMany({ where: { userId, householdId: { in: ids } }, data: { inOverview: true } });
      await tx.membership.updateMany({ where: { userId, householdId: { notIn: ids } }, data: { inOverview: false } });
    });
    return { householdIds: await this.householdIds(userId) };
  }

  async listEvents(userId: string, filters: EventFilters): Promise<EventListResponseDto> {
    return this.events.listAcross(userId, await this.householdIds(userId), filters);
  }

  async listTasks(userId: string): Promise<OverviewTaskListResponseDto> {
    const householdIds = await this.householdIds(userId);
    const [list, members] = await Promise.all([
      this.tasks.listAcross(userId, householdIds),
      this.prisma.membership.findMany({
        where: { householdId: { in: householdIds } },
        select: { householdId: true, userId: true, user: { select: { displayName: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return {
      ...list,
      members: members.map((m) => ({ householdId: m.householdId, userId: m.userId, displayName: m.user.displayName })),
    };
  }
}
