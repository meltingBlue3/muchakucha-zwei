import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AccessTokenGuard, type AccessTokenClaims } from '../auth/access-token.guard.js';
import { EventsService } from './events.service.js';
import { CreateEventDto, EventListResponseDto, EventResponseDto } from './dto/create-event.dto.js';
import { UpdateEventDto } from './dto/update-event.dto.js';
import { IsUUID } from 'class-validator';

interface AuthenticatedRequest {
  auth: AccessTokenClaims;
}

class HouseholdIdParam {
  @IsUUID('4')
  householdId!: string;
}

@ApiTags('events')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('households/:householdId/events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @ApiOperation({ operationId: 'createEvent' })
  @ApiCreatedResponse({ type: EventResponseDto })
  create(
    @Req() request: AuthenticatedRequest,
    @Param() params: HouseholdIdParam,
    @Body() input: CreateEventDto,
  ): Promise<EventResponseDto> {
    return this.eventsService.create(request.auth.sub, params.householdId, input);
  }

  @Get()
  @ApiOperation({ operationId: 'listEvents' })
  @ApiQuery({ name: 'startDate', required: false, description: 'ISO date string (inclusive)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'ISO date string (inclusive)' })
  @ApiOkResponse({ type: EventListResponseDto })
  list(
    @Req() request: AuthenticatedRequest,
    @Param() params: HouseholdIdParam,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<EventListResponseDto> {
    return this.eventsService.list(request.auth.sub, params.householdId, startDate, endDate);
  }

  @Get(':eventId')
  @ApiOperation({ operationId: 'getEvent' })
  @ApiOkResponse({ type: EventResponseDto })
  getById(
    @Req() request: AuthenticatedRequest,
    @Param() params: HouseholdIdParam & { eventId: string },
  ): Promise<EventResponseDto> {
    return this.eventsService.getById(request.auth.sub, params.householdId, params.eventId);
  }

  @Put(':eventId')
  @ApiOperation({ operationId: 'updateEvent' })
  @ApiOkResponse({ type: EventResponseDto })
  update(
    @Req() request: AuthenticatedRequest,
    @Param() params: HouseholdIdParam & { eventId: string },
    @Body() input: UpdateEventDto,
  ): Promise<EventResponseDto> {
    return this.eventsService.update(request.auth.sub, params.householdId, params.eventId, input);
  }

  @Delete(':eventId')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteEvent' })
  @ApiNoContentResponse()
  async delete(
    @Req() request: AuthenticatedRequest,
    @Param() params: HouseholdIdParam & { eventId: string },
  ): Promise<void> {
    await this.eventsService.delete(request.auth.sub, params.householdId, params.eventId);
  }
}
