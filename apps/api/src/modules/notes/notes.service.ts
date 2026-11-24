import { lockContent, replaceLabels } from '../shared/edit-version.js';
import { labelsByName } from '../shared/labels-by-name.js';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { labelResponse, type LabelRow } from '../labels/starter-labels.js';
import type { CreateNoteDto, NoteResponseDto, NoteListResponseDto } from './dto/create-note.dto.js';
import type { UpdateNoteDto } from './dto/update-note.dto.js';

const TITLE_MIN = 1;
const TITLE_MAX = 200;

interface NoteRow {
  id: string;
  householdId: string;
  title: string;
  body: string | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  pinnedAt: Date | null;
  labels: Array<{ label: LabelRow }>;
}

const withLabels = { labels: labelsByName } as const;

function noteNotFound(): NotFoundException {
  return new NotFoundException({ code: 'NOTE_NOT_FOUND', message: 'Note not found.' });
}

/**
 * Locks the note's row for a pin or label change and reads its version. Taken
 * in the same transaction as the write, so a body save that commits first is
 * the version written back, never an older one.
 */
async function lockNote(tx: Prisma.TransactionClient, householdId: string, noteId: string) {
  const rows = await tx.$queryRaw<Array<{ updatedAt: Date; pinnedAt: Date | null }>>`
    SELECT updated_at AS "updatedAt", pinned_at AS "pinnedAt" FROM notes
    WHERE id = ${noteId}::uuid AND household_id = ${householdId}::uuid
    FOR UPDATE
  `;
  if (!rows[0]) throw noteNotFound();
  return rows[0];
}

@Injectable()
export class NotesService {
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

  private async requireMember(actorId: string, householdId: string): Promise<void> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });
  }

  private canMutate(actorRole: 'OWNER' | 'ADMIN' | 'MEMBER', noteCreatorId: string, actorId: string): boolean {
    if (actorRole === 'MEMBER') return noteCreatorId === actorId;
    return true;
  }

  async create(
    actorId: string,
    householdId: string,
    input: CreateNoteDto,
  ): Promise<NoteResponseDto> {
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

    const note = await this.prisma.$transaction(async (tx) => {
      const created = await tx.note.create({
        data: {
          householdId,
          title: trimmedTitle,
          // Whitespace is Markdown syntax; only entirely blank bodies become null.
          body: input.body?.trim() ? input.body : null,
          createdBy: actorId,
          updatedBy: actorId,
          pinnedAt: input.pinned === true ? new Date() : null,
        },
      });
      await replaceLabels(tx, 'note', householdId, created.id, input.labelIds);
      return tx.note.findUniqueOrThrow({ where: { id: created.id }, include: withLabels });
    });

    return this.toResponse(note);
  }

  async list(
    actorId: string,
    householdId: string,
  ): Promise<NoteListResponseDto> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });

    const notes = await this.prisma.note.findMany({
      where: { householdId },
      include: withLabels,
      // Most recently touched first: a note earns its place by being worked
      // on, not by when it happened to be created.
      orderBy: { updatedAt: 'desc' },
    });

    return {
      notes: notes.map((n) => this.toResponse(n)),
      total: notes.length,
    };
  }

  async getById(
    actorId: string,
    householdId: string,
    noteId: string,
  ): Promise<NoteResponseDto> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });

    const note = await this.prisma.note.findUnique({ where: { id: noteId }, include: withLabels });
    if (note === null || note.householdId !== householdId) throw noteNotFound();
    return this.toResponse(note);
  }

  async update(
    actorId: string,
    householdId: string,
    noteId: string,
    input: UpdateNoteDto,
  ): Promise<NoteResponseDto> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });

    const note = await this.prisma.note.findUnique({ where: { id: noteId } });
    if (note === null || note.householdId !== householdId) {
      throw new NotFoundException({ code: 'NOTE_NOT_FOUND', message: 'Note not found.' });
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
    if (input.body !== undefined) {
      data.body = input.body?.trim() ? input.body : null;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedAt = await lockContent(tx, 'note', householdId, noteId, input);
      return tx.note.update({
        where: { id: noteId }, data: { ...data, updatedAt, updatedBy: actorId }, include: withLabels,
      });
    });

    return this.toResponse(updated);
  }

  /**
   * Pins the note for the whole household, or unpins it. Any member may, and
   * it needs no edit version: pinning is not an edit of the note, so it leaves
   * updatedAt and updatedBy alone and a body save in progress keeps its base.
   * Pinning a pinned note keeps the time it was first pinned.
   */
  async setPinned(
    actorId: string,
    householdId: string,
    noteId: string,
    pinned: boolean,
  ): Promise<NoteResponseDto> {
    await this.requireMember(actorId, householdId);

    const note = await this.prisma.$transaction(async (tx) => {
      const current = await lockNote(tx, householdId, noteId);
      return tx.note.update({
        where: { id: noteId },
        data: {
          pinnedAt: pinned ? current.pinnedAt ?? new Date() : null,
          // Prisma's @updatedAt stamps every update with the current time
          // unless it is given a value. Writing the read one back keeps a pin
          // from counting as an edit, which would turn the next body save of
          // anyone writing this note into an edit conflict.
          updatedAt: current.updatedAt,
        },
        include: withLabels,
      });
    });

    return this.toResponse(note);
  }

  /**
   * Replaces the note's labels with labels of this household; an empty list
   * removes them all. Like pinning, any member may, without an edit version,
   * and the note's own row is not written, so updatedAt and updatedBy stay.
   * Two people relabelling at once: the later save wins.
   */
  async replaceLabels(
    actorId: string,
    householdId: string,
    noteId: string,
    labelIds: string[],
  ): Promise<NoteResponseDto> {
    await this.requireMember(actorId, householdId);

    const note = await this.prisma.$transaction(async (tx) => {
      await lockNote(tx, householdId, noteId);
      await replaceLabels(tx, 'note', householdId, noteId, labelIds);
      return tx.note.findUniqueOrThrow({ where: { id: noteId }, include: withLabels });
    });

    return this.toResponse(note);
  }

  async delete(
    actorId: string,
    householdId: string,
    noteId: string,
    expected?: { expectedUpdatedAt: string },
  ): Promise<void> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });

    const note = await this.prisma.note.findUnique({ where: { id: noteId } });
    if (note === null || note.householdId !== householdId) {
      throw new NotFoundException({ code: 'NOTE_NOT_FOUND', message: 'Note not found.' });
    }

    if (!this.canMutate(role, note.createdBy, actorId)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only the note creator, admin, or owner can delete this note.',
      });
    }

    await this.prisma.$transaction(async tx => {
      await lockContent(tx, 'note', householdId, noteId, expected);
      await tx.note.delete({ where: { id: noteId } });
    });
  }

  private toResponse(row: NoteRow): NoteResponseDto {
    return {
      id: row.id,
      householdId: row.householdId,
      title: row.title,
      body: row.body,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      pinnedAt: row.pinnedAt?.toISOString() ?? null,
      labels: row.labels.map(({ label }) => labelResponse(label)),
    };
  }
}
