import { Body, Controller, Delete, HttpCode, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard, type AccessTokenClaims } from '../auth/access-token.guard.js';
import { RegisterReminderPushDto, ReminderPushStatusDto } from './dto/reminder-push.dto.js';
import { ReminderPushService } from './reminder-push.service.js';

@ApiTags('reminders')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('users/me/reminder-push')
export class ReminderPushController {
  constructor(private readonly push: ReminderPushService) {}

  @Put()
  @ApiOperation({ operationId: 'registerReminderPush' })
  @ApiOkResponse({ type: ReminderPushStatusDto })
  register(@Req() request: { auth: AccessTokenClaims }, @Body() input: RegisterReminderPushDto): Promise<ReminderPushStatusDto> {
    return this.push.register(request.auth.sid, input);
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ operationId: 'unregisterReminderPush' })
  @ApiNoContentResponse()
  async unregister(@Req() request: { auth: AccessTokenClaims }): Promise<void> {
    await this.push.unregister(request.auth.sid);
  }
}
