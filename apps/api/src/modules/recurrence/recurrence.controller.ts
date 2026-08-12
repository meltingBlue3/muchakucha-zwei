import { Body, Controller, Delete, HttpCode, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
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

class HouseholdIdParam {
  @IsUUID('4')
  householdId!: string;
}

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
    @Param() params: HouseholdIdParam & { eventId: string },
    @Body() input: UpdateSeriesDto,
  ): Promise<SeriesMutationResponseDto> {
    return this.recurrenceService.updateSeriesFromOccurrence(
      request.auth.sub, params.householdId, 'event', params.eventId, input,
    );
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteEventSeries' })
  @ApiNoContentResponse()
  delete(
    @Req() request: AuthenticatedRequest,
    @Param() params: HouseholdIdParam & { eventId: string },
    @Query() query: DeleteSeriesQueryDto,
  ): Promise<void> {
    return this.recurrenceService.deleteSeriesFromOccurrence(
      request.auth.sub, params.householdId, 'event', params.eventId, query.scope,
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
    @Param() params: HouseholdIdParam & { taskId: string },
    @Body() input: UpdateSeriesDto,
  ): Promise<SeriesMutationResponseDto> {
    return this.recurrenceService.updateSeriesFromOccurrence(
      request.auth.sub, params.householdId, 'task', params.taskId, input,
    );
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteTaskSeries' })
  @ApiNoContentResponse()
  delete(
    @Req() request: AuthenticatedRequest,
    @Param() params: HouseholdIdParam & { taskId: string },
    @Query() query: DeleteSeriesQueryDto,
  ): Promise<void> {
    return this.recurrenceService.deleteSeriesFromOccurrence(
      request.auth.sub, params.householdId, 'task', params.taskId, query.scope,
    );
  }
}
