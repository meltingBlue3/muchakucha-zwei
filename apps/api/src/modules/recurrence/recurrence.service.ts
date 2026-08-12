import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { RecurrenceMaterializerService } from './recurrence-materializer.service.js';

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
    materializer: RecurrenceMaterializerService,
  ) {
    void materializer;
  }

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
}
