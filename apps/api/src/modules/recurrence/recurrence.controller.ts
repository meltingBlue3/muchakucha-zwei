import { Body, Controller, Delete, HttpCode, Param, ParseUUIDPipe, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard, type AccessTokenClaims } from '../auth/access-token.guard.js';
import {
  DeleteSeriesQueryDto,
  SeriesMutationResponseDto,
  UpdateSeriesDto,
} from './dto/recurrence.dto.js';
import { RecurrenceService } from './recurrence.service.js';

interface AuthenticatedRequest {
  auth: AccessTokenClaims;
}

// Path params are validated with per-parameter pipes rather than a param DTO.
// TypeScript emits `Object` as the design:paramtypes metadata for an
// intersection type, and Nest's ValidationPipe exempts `Object` — so a param
// class's class-validator decorators never run and a malformed id reaches
// Prisma, surfacing as a 500 instead of a 400.
const uuidParam = new ParseUUIDPipe({ version: '4' });

@ApiTags('recurrence')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('households/:householdId/events/:eventId/series')
export class EventSeriesController {
  constructor(private readonly recurrenceService: RecurrenceService) {}

  @Put()
  @ApiOperation({ operationId: 'updateEventSeries' })
  @ApiOkResponse({ type: SeriesMutationResponseDto })
  update(
    @Req() request: AuthenticatedRequest,
    @Param('householdId', uuidParam) householdId: string,
    @Param('eventId', uuidParam) eventId: string,
    @Body() input: UpdateSeriesDto,
  ): Promise<SeriesMutationResponseDto> {
    return this.recurrenceService.updateSeriesFromOccurrence(
      request.auth.sub, householdId, 'event', eventId, input,
    );
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteEventSeries' })
  @ApiNoContentResponse()
  delete(
    @Req() request: AuthenticatedRequest,
    @Param('householdId', uuidParam) householdId: string,
    @Param('eventId', uuidParam) eventId: string,
    @Query() query: DeleteSeriesQueryDto,
  ): Promise<void> {
    return this.recurrenceService.deleteSeriesFromOccurrence(
      request.auth.sub, householdId, 'event', eventId, query.scope,
    );
  }
}

@ApiTags('recurrence')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('households/:householdId/tasks/:taskId/series')
export class TaskSeriesController {
  constructor(private readonly recurrenceService: RecurrenceService) {}

  @Put()
  @ApiOperation({ operationId: 'updateTaskSeries' })
  @ApiOkResponse({ type: SeriesMutationResponseDto })
  update(
    @Req() request: AuthenticatedRequest,
    @Param('householdId', uuidParam) householdId: string,
    @Param('taskId', uuidParam) taskId: string,
    @Body() input: UpdateSeriesDto,
  ): Promise<SeriesMutationResponseDto> {
    return this.recurrenceService.updateSeriesFromOccurrence(
      request.auth.sub, householdId, 'task', taskId, input,
    );
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteTaskSeries' })
  @ApiNoContentResponse()
  delete(
    @Req() request: AuthenticatedRequest,
    @Param('householdId', uuidParam) householdId: string,
    @Param('taskId', uuidParam) taskId: string,
    @Query() query: DeleteSeriesQueryDto,
  ): Promise<void> {
    return this.recurrenceService.deleteSeriesFromOccurrence(
      request.auth.sub, householdId, 'task', taskId, query.scope,
    );
  }
}
