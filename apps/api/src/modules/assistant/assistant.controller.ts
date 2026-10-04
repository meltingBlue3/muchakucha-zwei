import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AccessTokenGuard, type AccessTokenClaims } from '../auth/access-token.guard.js';
import { AssistantSettingsService } from './assistant-settings.service.js';
import { AssistantService } from './assistant.service.js';
import {
  AssistantConversationListResponseDto, AssistantConversationParam, AssistantConversationResponseDto, AssistantHouseholdParam,
  AssistantProviderListResponseDto, AssistantProviderParam, AssistantProviderResponseDto, CreateAssistantConversationDto,
  CreateAssistantProviderDto, DecideAssistantActionDto, SendAssistantMessageDto, UpdateAssistantProviderDto,
} from './dto/assistant.dto.js';

interface AuthenticatedRequest { auth: AccessTokenClaims }

@ApiTags('assistant')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('households/:householdId/assistant')
export class AssistantController {
  constructor(private readonly settings: AssistantSettingsService, private readonly assistant: AssistantService) {}

  @Get('providers')
  @ApiOperation({ operationId: 'listAssistantProviders' })
  @ApiOkResponse({ type: AssistantProviderListResponseDto })
  listProviders(@Req() req: AuthenticatedRequest, @Param() params: AssistantHouseholdParam) {
    return this.settings.list({ userId: req.auth.sub, householdId: params.householdId });
  }

  @Post('providers')
  @ApiOperation({ operationId: 'createAssistantProvider' })
  @ApiCreatedResponse({ type: AssistantProviderResponseDto })
  createProvider(@Req() req: AuthenticatedRequest, @Param() params: AssistantHouseholdParam, @Body() input: CreateAssistantProviderDto) {
    return this.settings.create({ userId: req.auth.sub, householdId: params.householdId }, input);
  }

  @Put('providers/:providerId')
  @ApiOperation({ operationId: 'updateAssistantProvider' })
  @ApiOkResponse({ type: AssistantProviderResponseDto })
  updateProvider(@Req() req: AuthenticatedRequest, @Param() params: AssistantProviderParam, @Body() input: UpdateAssistantProviderDto) {
    return this.settings.update({ userId: req.auth.sub, householdId: params.householdId }, params.providerId, input);
  }

  @Delete('providers/:providerId')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteAssistantProvider' })
  @ApiNoContentResponse()
  deleteProvider(@Req() req: AuthenticatedRequest, @Param() params: AssistantProviderParam) {
    return this.settings.delete({ userId: req.auth.sub, householdId: params.householdId }, params.providerId);
  }

  @Get('conversations')
  @ApiOperation({ operationId: 'listAssistantConversations' })
  @ApiOkResponse({ type: AssistantConversationListResponseDto })
  listConversations(@Req() req: AuthenticatedRequest, @Param() params: AssistantHouseholdParam) {
    return this.assistant.list({ userId: req.auth.sub, householdId: params.householdId });
  }

  @Post('conversations')
  @ApiOperation({ operationId: 'createAssistantConversation' })
  @ApiCreatedResponse({ type: AssistantConversationResponseDto })
  createConversation(@Req() req: AuthenticatedRequest, @Param() params: AssistantHouseholdParam, @Body() input: CreateAssistantConversationDto) {
    return this.assistant.create({ userId: req.auth.sub, householdId: params.householdId }, input.providerId);
  }

  @Get('conversations/:conversationId')
  @ApiOperation({ operationId: 'getAssistantConversation' })
  @ApiOkResponse({ type: AssistantConversationResponseDto })
  getConversation(@Req() req: AuthenticatedRequest, @Param() params: AssistantConversationParam) {
    return this.assistant.get({ userId: req.auth.sub, householdId: params.householdId }, params.conversationId);
  }

  @Delete('conversations/:conversationId')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteAssistantConversation' })
  @ApiNoContentResponse()
  deleteConversation(@Req() req: AuthenticatedRequest, @Param() params: AssistantConversationParam) {
    return this.assistant.delete({ userId: req.auth.sub, householdId: params.householdId }, params.conversationId);
  }

  @Post('conversations/:conversationId/messages')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ operationId: 'sendAssistantMessage' })
  @ApiOkResponse({ type: AssistantConversationResponseDto })
  send(@Req() req: AuthenticatedRequest, @Param() params: AssistantConversationParam, @Body() input: SendAssistantMessageDto) {
    return this.assistant.send({ userId: req.auth.sub, householdId: params.householdId }, params.conversationId, input);
  }

  @Post('conversations/:conversationId/decision')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ operationId: 'decideAssistantAction' })
  @ApiOkResponse({ type: AssistantConversationResponseDto })
  decide(@Req() req: AuthenticatedRequest, @Param() params: AssistantConversationParam, @Body() input: DecideAssistantActionDto) {
    return this.assistant.decide({ userId: req.auth.sub, householdId: params.householdId }, params.conversationId, input);
  }
}
