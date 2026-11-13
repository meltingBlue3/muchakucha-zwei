import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiHeader, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AccessTokenGuard, type AccessTokenClaims } from '../auth/access-token.guard.js';
import { assistantLanguage } from './assistant-language.js';
import { AssistantSettingsService } from './assistant-settings.service.js';
import { AssistantService } from './assistant.service.js';
import {
  AssistantConversationListResponseDto, AssistantConversationParam, AssistantConversationResponseDto, AssistantHouseholdParam,
  AssistantProviderCheckResponseDto, AssistantProviderListResponseDto, AssistantProviderParam, AssistantProviderResponseDto,
  AssistantTranscriptionResponseDto, CheckAssistantProviderDto, CreateAssistantConversationDto,
  CreateAssistantProviderDto, DecideAssistantActionDto, SendAssistantMessageDto, TranscribeAssistantAudioDto, UpdateAssistantProviderDto,
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

  @Post('providers/check')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ operationId: 'checkAssistantProvider' })
  @ApiOkResponse({ type: AssistantProviderCheckResponseDto })
  checkProvider(@Req() req: AuthenticatedRequest, @Param() params: AssistantHouseholdParam, @Body() input: CheckAssistantProviderDto) {
    return this.assistant.check({ userId: req.auth.sub, householdId: params.householdId }, input);
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

  @Post('transcriptions')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ operationId: 'transcribeAssistantAudio' })
  @ApiHeader({ name: 'Accept-Language', required: false, description: 'Interface language (zh or ja).' })
  @ApiOkResponse({ type: AssistantTranscriptionResponseDto })
  transcribe(@Req() req: AuthenticatedRequest, @Param() params: AssistantHouseholdParam, @Body() input: TranscribeAssistantAudioDto, @Headers('accept-language') language?: string) {
    return this.assistant.transcribe({ userId: req.auth.sub, householdId: params.householdId }, input, assistantLanguage(language));
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
  @ApiHeader({ name: 'Accept-Language', required: false, description: 'Interface language (zh or ja).' })
  @ApiOkResponse({ type: AssistantConversationResponseDto })
  getConversation(@Req() req: AuthenticatedRequest, @Param() params: AssistantConversationParam, @Headers('accept-language') language?: string) {
    return this.assistant.get({ userId: req.auth.sub, householdId: params.householdId }, params.conversationId, assistantLanguage(language));
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
  @ApiHeader({ name: 'Accept-Language', required: false, description: 'Interface language (zh or ja).' })
  @ApiOkResponse({ type: AssistantConversationResponseDto })
  send(@Req() req: AuthenticatedRequest, @Param() params: AssistantConversationParam, @Body() input: SendAssistantMessageDto, @Headers('accept-language') language?: string) {
    return this.assistant.send({ userId: req.auth.sub, householdId: params.householdId }, params.conversationId, input, assistantLanguage(language));
  }

  @Post('conversations/:conversationId/decision')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ operationId: 'decideAssistantAction' })
  @ApiHeader({ name: 'Accept-Language', required: false, description: 'Interface language (zh or ja).' })
  @ApiOkResponse({ type: AssistantConversationResponseDto })
  decide(@Req() req: AuthenticatedRequest, @Param() params: AssistantConversationParam, @Body() input: DecideAssistantActionDto, @Headers('accept-language') language?: string) {
    return this.assistant.decide({ userId: req.auth.sub, householdId: params.householdId }, params.conversationId, input, assistantLanguage(language));
  }
}
