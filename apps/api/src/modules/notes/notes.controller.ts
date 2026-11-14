import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AccessTokenGuard, type AccessTokenClaims } from '../auth/access-token.guard.js';
import { NotesService } from './notes.service.js';
import { CreateNoteDto, NoteListResponseDto, NoteResponseDto } from './dto/create-note.dto.js';
import { UpdateNoteDto } from './dto/update-note.dto.js';

interface AuthenticatedRequest {
  auth: AccessTokenClaims;
}

// Per-parameter pipes, as in events.controller.ts: an intersection param type
// emits `Object` metadata, which ValidationPipe skips, so a malformed id would
// reach Prisma and surface as a 500.
const uuidParam = new ParseUUIDPipe({ version: '4' });

@ApiTags('notes')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('households/:householdId/notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Post()
  @ApiOperation({ operationId: 'createNote' })
  @ApiCreatedResponse({ type: NoteResponseDto })
  create(
    @Req() request: AuthenticatedRequest,
    @Param('householdId', uuidParam) householdId: string,
    @Body() input: CreateNoteDto,
  ): Promise<NoteResponseDto> {
    return this.notesService.create(request.auth.sub, householdId, input);
  }

  @Get()
  @ApiOperation({ operationId: 'listNotes' })
  @ApiOkResponse({ type: NoteListResponseDto })
  list(
    @Req() request: AuthenticatedRequest,
    @Param('householdId', uuidParam) householdId: string,
  ): Promise<NoteListResponseDto> {
    return this.notesService.list(request.auth.sub, householdId);
  }

  @Get(':noteId')
  @ApiOperation({ operationId: 'getNote' })
  @ApiOkResponse({ type: NoteResponseDto })
  getById(
    @Req() request: AuthenticatedRequest,
    @Param('householdId', uuidParam) householdId: string,
    @Param('noteId', uuidParam) noteId: string,
  ): Promise<NoteResponseDto> {
    return this.notesService.getById(request.auth.sub, householdId, noteId);
  }

  @Put(':noteId')
  @ApiOperation({ operationId: 'updateNote' })
  @ApiOkResponse({ type: NoteResponseDto })
  update(
    @Req() request: AuthenticatedRequest,
    @Param('householdId', uuidParam) householdId: string,
    @Param('noteId', uuidParam) noteId: string,
    @Body() input: UpdateNoteDto,
  ): Promise<NoteResponseDto> {
    return this.notesService.update(request.auth.sub, householdId, noteId, input);
  }

  @Delete(':noteId')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteNote' })
  @ApiNoContentResponse()
  async delete(
    @Req() request: AuthenticatedRequest,
    @Param('householdId', uuidParam) householdId: string,
    @Param('noteId', uuidParam) noteId: string,
  ): Promise<void> {
    await this.notesService.delete(request.auth.sub, householdId, noteId);
  }
}
