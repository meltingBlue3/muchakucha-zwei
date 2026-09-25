import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
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
  createdAt: Date;
  updatedAt: Date;
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

    const note = await this.prisma.note.create({
      data: {
        householdId,
        title: trimmedTitle,
        body: input.body?.trim() || null,
        createdBy: actorId,
      },
    });

    return this.toResponse(note);
  }

  async list(
    actorId: string,
    householdId: string,
  ): Promise<NoteListResponseDto> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });

    const [notes, total] = await Promise.all([
      this.prisma.note.findMany({
        where: { householdId },
        // Most recently touched first: a note earns its place by being worked
        // on, not by when it happened to be created.
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.note.count({ where: { householdId } }),
    ]);

    return {
      notes: notes.map((n) => this.toResponse(n)),
      total,
    };
  }

  async getById(
    actorId: string,
    householdId: string,
    noteId: string,
  ): Promise<NoteResponseDto> {
    const role = await this.resolveActorRole(actorId, householdId);
    if (role === null) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });

    const note = await this.prisma.note.findUnique({ where: { id: noteId } });
    if (note === null || note.householdId !== householdId) {
      throw new NotFoundException({ code: 'NOTE_NOT_FOUND', message: 'Note not found.' });
    }
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

    if (!this.canMutate(role, note.createdBy, actorId)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only the note creator, admin, or owner can edit this note.',
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
    if (input.body !== undefined) {
      data.body = input.body?.trim() || null;
    }

    const updated = await this.prisma.note.update({
      where: { id: noteId },
      data,
    });

    return this.toResponse(updated);
  }

  async delete(
    actorId: string,
    householdId: string,
    noteId: string,
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

    await this.prisma.note.delete({ where: { id: noteId } });
  }

  private toResponse(row: NoteRow): NoteResponseDto {
    return {
      id: row.id,
      householdId: row.householdId,
      title: row.title,
      body: row.body,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
