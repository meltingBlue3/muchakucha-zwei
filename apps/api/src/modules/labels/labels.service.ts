import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { isUniqueConflict } from '../shared/unique-conflict.js';
import type { CreateLabelDto, LabelResponseDto, LabelListResponseDto } from './dto/create-label.dto.js';
import type { UpdateLabelDto } from './dto/create-label.dto.js';

const NAME_MIN = 1;
const NAME_MAX = 40;
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

// The pre-check gives the common case a clear answer; the unique index still
// decides a race, and its P2002 becomes the same error instead of a 500.
function duplicateName(): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    message: 'Request validation failed.',
    details: [{ field: 'name', codes: ['duplicate'], message: 'A label with this name already exists in this household.' }],
  });
}

function rethrowDuplicate(error: unknown): never {
  throw isUniqueConflict(error) ? duplicateName() : error;
}

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
    if (existing !== null) throw duplicateName();

    const label = await this.prisma.label.create({
      data: { householdId, name, color: input.color, createdBy: actorId },
    }).catch(rethrowDuplicate);

    return this.toResponse(label);
  }

  async list(
    actorId: string,
    householdId: string,
  ): Promise<LabelListResponseDto> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });

    const [labels, usage] = await Promise.all([
      this.prisma.label.findMany({
        where: { householdId },
        orderBy: { name: 'asc' },
      }),
      this.usage(householdId),
    ]);

    return {
      labels: labels.map((l) => ({ ...this.toResponse(l), usage: usage.get(l.id) ?? { events: 0, tasks: 0 } })),
      total: labels.length,
    };
  }

  /**
   * How many events and tasks carry each label. A recurring series is one item
   * however many occurrences it has generated: occurrence rows count by their
   * series, together with the series' own labels.
   */
  private async usage(householdId: string): Promise<Map<string, { events: number; tasks: number }>> {
    const rows = await this.prisma.$queryRaw<Array<{ labelId: string; events: number; tasks: number }>>`
      WITH items AS (
        SELECT el.label_id, 'event' AS kind, COALESCE('rule:' || e.recurrence_rule_id::text, e.id::text) AS item
        FROM event_labels el JOIN events e ON e.id = el.event_id
        WHERE e.household_id = ${householdId}::uuid
        UNION
        SELECT tl.label_id, 'task', COALESCE('rule:' || t.recurrence_rule_id::text, t.id::text)
        FROM task_labels tl JOIN tasks t ON t.id = tl.task_id
        WHERE t.household_id = ${householdId}::uuid
        UNION
        SELECT rl.label_id,
          CASE WHEN EXISTS (SELECT 1 FROM tasks t WHERE t.recurrence_rule_id = r.id) THEN 'task' ELSE 'event' END,
          'rule:' || r.id::text
        FROM recurrence_rule_labels rl JOIN recurrence_rules r ON r.id = rl.rule_id
        WHERE r.household_id = ${householdId}::uuid
      )
      SELECT label_id::text AS "labelId",
        (count(*) FILTER (WHERE kind = 'event'))::int AS events,
        (count(*) FILTER (WHERE kind = 'task'))::int AS tasks
      FROM items
      GROUP BY label_id
    `;
    return new Map(rows.map(({ labelId, events, tasks }) => [labelId, { events, tasks }]));
  }

  async update(
    actorId: string,
    householdId: string,
    labelId: string,
    input: UpdateLabelDto,
    expected?: Pick<LabelResponseDto, 'name' | 'color'>,
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
        if (conflict !== null) throw duplicateName();
      }

      data.name = name;
    }

    if (input.color !== undefined) {
      this.validateColor(input.color);
      data.color = input.color;
    }

    const updated = await this.prisma.$transaction(async tx => {
      await this.lockLabelSnapshot(tx, householdId, labelId, expected);
      return tx.label.update({ where: { id: labelId }, data });
    }).catch(rethrowDuplicate);
    return this.toResponse(updated);
  }

  async delete(
    actorId: string,
    householdId: string,
    labelId: string,
    expected?: Pick<LabelResponseDto, 'name' | 'color'>,
  ): Promise<void> {
    this.requireAdmin(await this.resolveActorRole(actorId, householdId));

    const label = await this.prisma.label.findUnique({ where: { id: labelId } });
    if (label === null || label.householdId !== householdId) {
      throw new NotFoundException({ code: 'LABEL_NOT_FOUND', message: 'Label not found.' });
    }

    // Junction rows cascade automatically (onDelete: Cascade on both sides).
    await this.prisma.$transaction(async tx => {
      await this.lockLabelSnapshot(tx, householdId, labelId, expected);
      await tx.label.delete({ where: { id: labelId } });
    });
  }

  private async lockLabelSnapshot(
    tx: Prisma.TransactionClient,
    householdId: string,
    labelId: string,
    expected: Pick<LabelResponseDto, 'name' | 'color'> | undefined,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ name: string; color: string }>>`
      SELECT name, color FROM labels
      WHERE id = ${labelId}::uuid AND household_id = ${householdId}::uuid
      FOR UPDATE
    `;
    const current = rows[0];
    if (!current) throw new NotFoundException({ code: 'LABEL_NOT_FOUND', message: 'Label not found.' });
    if (expected && (current.name !== expected.name || current.color !== expected.color)) {
      throw new ConflictException({ code: 'EDIT_CONFLICT', message: 'Label has changed. Read it again before saving.' });
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
