import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
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
import { IsUUID } from 'class-validator';

interface AuthenticatedRequest {
  auth: AccessTokenClaims;
}

class HouseholdIdParam {
  @IsUUID('4')
  householdId!: string;
}

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
    @Param() params: HouseholdIdParam,
    @Body() input: CreateNoteDto,
  ): Promise<NoteResponseDto> {
    return this.notesService.create(request.auth.sub, params.householdId, input);
  }

  @Get()
  @ApiOperation({ operationId: 'listNotes' })
  @ApiOkResponse({ type: NoteListResponseDto })
  list(
    @Req() request: AuthenticatedRequest,
    @Param() params: HouseholdIdParam,
  ): Promise<NoteListResponseDto> {
    return this.notesService.list(request.auth.sub, params.householdId);
  }

  @Get(':noteId')
  @ApiOperation({ operationId: 'getNote' })
  @ApiOkResponse({ type: NoteResponseDto })
  getById(
    @Req() request: AuthenticatedRequest,
    @Param() params: HouseholdIdParam & { noteId: string },
  ): Promise<NoteResponseDto> {
    return this.notesService.getById(request.auth.sub, params.householdId, params.noteId);
  }

  @Put(':noteId')
  @ApiOperation({ operationId: 'updateNote' })
  @ApiOkResponse({ type: NoteResponseDto })
  update(
    @Req() request: AuthenticatedRequest,
    @Param() params: HouseholdIdParam & { noteId: string },
    @Body() input: UpdateNoteDto,
  ): Promise<NoteResponseDto> {
    return this.notesService.update(request.auth.sub, params.householdId, params.noteId, input);
  }

  @Delete(':noteId')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteNote' })
  @ApiNoContentResponse()
  async delete(
    @Req() request: AuthenticatedRequest,
    @Param() params: HouseholdIdParam & { noteId: string },
  ): Promise<void> {
    await this.notesService.delete(request.auth.sub, params.householdId, params.noteId);
  }
}
