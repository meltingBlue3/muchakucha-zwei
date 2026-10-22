import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard, type AccessTokenClaims } from '../auth/access-token.guard.js';
import {
  ReminderChoiceDto,
  ReminderSettingsDto,
  UpcomingReminderListDto,
  UpdateReminderSettingsDto,
} from './dto/reminder.dto.js';
import { RemindersService } from './reminders.service.js';

interface AuthenticatedRequest {
  auth: AccessTokenClaims;
}

const uuidParam = new ParseUUIDPipe({ version: '4' });

/** Reminders are personal: every route reads or writes only the caller's own. */
@ApiTags('reminders')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller()
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get('users/me/reminder-settings')
  @ApiOperation({ operationId: 'getReminderSettings' })
  @ApiOkResponse({ type: ReminderSettingsDto })
  getSettings(@Req() request: AuthenticatedRequest): Promise<ReminderSettingsDto> {
    return this.reminders.getSettings(request.auth.sub);
  }

  @Put('users/me/reminder-settings')
  @ApiOperation({ operationId: 'updateReminderSettings' })
  @ApiOkResponse({ type: ReminderSettingsDto })
  updateSettings(@Req() request: AuthenticatedRequest, @Body() body: UpdateReminderSettingsDto): Promise<ReminderSettingsDto> {
    return this.reminders.updateSettings(request.auth.sub, body);
  }

  @Get('users/me/reminders')
  @ApiOperation({ operationId: 'listUpcomingReminders' })
  @ApiQuery({ name: 'timeZone', required: true, description: 'IANA time zone of the device, e.g. Asia/Shanghai.' })
  @ApiOkResponse({ type: UpcomingReminderListDto })
  upcoming(@Req() request: AuthenticatedRequest, @Query('timeZone') timeZone?: string): Promise<UpcomingReminderListDto> {
    return this.reminders.upcoming(request.auth.sub, timeZone);
  }

  @Put('households/:householdId/tasks/:taskId/my-reminder')
  @ApiOperation({ operationId: 'setTaskReminder' })
  @ApiOkResponse({ type: ReminderChoiceDto })
  setTaskReminder(
    @Req() request: AuthenticatedRequest,
    @Param('householdId', uuidParam) householdId: string,
    @Param('taskId', uuidParam) taskId: string,
    @Body() body: ReminderChoiceDto,
  ): Promise<ReminderChoiceDto> {
    return this.reminders.setReminder(request.auth.sub, householdId, 'task', taskId, body);
  }

  @Put('households/:householdId/events/:eventId/my-reminder')
  @ApiOperation({ operationId: 'setEventReminder' })
  @ApiOkResponse({ type: ReminderChoiceDto })
  setEventReminder(
    @Req() request: AuthenticatedRequest,
    @Param('householdId', uuidParam) householdId: string,
    @Param('eventId', uuidParam) eventId: string,
    @Body() body: ReminderChoiceDto,
  ): Promise<ReminderChoiceDto> {
    return this.reminders.setReminder(request.auth.sub, householdId, 'event', eventId, body);
  }
}
