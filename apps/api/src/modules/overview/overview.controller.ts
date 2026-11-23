import { Body, Controller, Get, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard, type AccessTokenClaims } from '../auth/access-token.guard.js';
import { EventListResponseDto } from '../events/dto/create-event.dto.js';
import { OverviewHouseholdsDto, OverviewTaskListResponseDto, UpdateOverviewHouseholdsDto } from './dto/overview.dto.js';
import { OverviewService } from './overview.service.js';

interface AuthenticatedRequest {
  auth: AccessTokenClaims;
}

/** The caller's 总览: their chosen households read together. */
@ApiTags('overview')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('users/me/overview')
export class OverviewController {
  constructor(private readonly overview: OverviewService) {}

  @Put()
  @ApiOperation({ operationId: 'updateOverviewHouseholds' })
  @ApiOkResponse({ type: OverviewHouseholdsDto })
  update(@Req() request: AuthenticatedRequest, @Body() body: UpdateOverviewHouseholdsDto): Promise<OverviewHouseholdsDto> {
    return this.overview.update(request.auth.sub, body.householdIds);
  }

  @Get('events')
  @ApiOperation({ operationId: 'listOverviewEvents' })
  @ApiQuery({ name: 'startDate', required: false, description: 'ISO date string (inclusive)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'ISO date string (inclusive)' })
  @ApiQuery({ name: 'expandRecurring', required: false, type: Boolean, description: 'Generate recurring events for a bounded calendar range (at most 366 days).' })
  @ApiOkResponse({ type: EventListResponseDto })
  listEvents(
    @Req() request: AuthenticatedRequest,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('expandRecurring') expandRecurring?: string,
  ): Promise<EventListResponseDto> {
    return this.overview.listEvents(request.auth.sub, { startDate, endDate, expandRecurring });
  }

  @Get('tasks')
  @ApiOperation({ operationId: 'listOverviewTasks' })
  @ApiOkResponse({ type: OverviewTaskListResponseDto })
  listTasks(@Req() request: AuthenticatedRequest): Promise<OverviewTaskListResponseDto> {
    return this.overview.listTasks(request.auth.sub);
  }
}
