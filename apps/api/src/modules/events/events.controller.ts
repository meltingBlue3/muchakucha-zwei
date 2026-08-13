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

interface AuthenticatedRequest {
  auth: AccessTokenClaims;
}

// WR-06: TypeScript emits `Object` as the design:paramtypes metadata for an
// intersection param type (the `HouseholdIdParam & { eventId: string }`
// shape this file used to use), and Nest's ValidationPipe exempts `Object`
// — so a param class's class-validator decorators never run and a
// malformed id reaches Prisma, surfacing as a 500 instead of a 404.
// recurrence.controller.ts documents and avoids this exact trap with a
// per-parameter pipe; this file now matches it.
const uuidParam = new ParseUUIDPipe({ version: '4' });

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
    @Param('householdId', uuidParam) householdId: string,
    @Body() input: CreateEventDto,
  ): Promise<EventResponseDto> {
    return this.eventsService.create(request.auth.sub, householdId, input);
  }

  @Get()
  @ApiOperation({ operationId: 'listEvents' })
  @ApiQuery({ name: 'startDate', required: false, description: 'ISO date string (inclusive)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'ISO date string (inclusive)' })
  @ApiQuery({ name: 'recurring', required: false })
  @ApiOkResponse({ type: EventListResponseDto })
  list(
    @Req() request: AuthenticatedRequest,
    @Param('householdId', uuidParam) householdId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('recurring') recurring?: string,
  ): Promise<EventListResponseDto> {
    return this.eventsService.list(request.auth.sub, householdId, { startDate, endDate, recurring });
  }

  @Get(':eventId')
  @ApiOperation({ operationId: 'getEvent' })
  @ApiOkResponse({ type: EventResponseDto })
  getById(
    @Req() request: AuthenticatedRequest,
    @Param('householdId', uuidParam) householdId: string,
    @Param('eventId', uuidParam) eventId: string,
  ): Promise<EventResponseDto> {
    return this.eventsService.getById(request.auth.sub, householdId, eventId);
  }

  @Put(':eventId')
  @ApiOperation({ operationId: 'updateEvent' })
  @ApiOkResponse({ type: EventResponseDto })
  update(
    @Req() request: AuthenticatedRequest,
    @Param('householdId', uuidParam) householdId: string,
    @Param('eventId', uuidParam) eventId: string,
    @Body() input: UpdateEventDto,
  ): Promise<EventResponseDto> {
    return this.eventsService.update(request.auth.sub, householdId, eventId, input);
  }

  @Delete(':eventId')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteEvent' })
  @ApiNoContentResponse()
  async delete(
    @Req() request: AuthenticatedRequest,
    @Param('householdId', uuidParam) householdId: string,
    @Param('eventId', uuidParam) eventId: string,
  ): Promise<void> {
    await this.eventsService.delete(request.auth.sub, householdId, eventId);
  }
}
