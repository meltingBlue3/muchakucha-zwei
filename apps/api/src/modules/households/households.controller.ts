import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString } from 'class-validator';
import { AccessTokenGuard, type AccessTokenClaims } from '../auth/access-token.guard.js';
import {
  CreateHouseholdDto,
  CreateHouseholdResponseDto,
  ListMyHouseholdsItemDto,
} from './dto/create-household.dto.js';
import { GetHouseholdResponseDto } from './dto/membership.dto.js';
import { UpdateHouseholdDto } from './dto/update-household.dto.js';
import { HouseholdsService } from './households.service.js';

// ---- Invitation Send DTOs (exported from controller per Plan 02-05 scope exception) ----

export class SendHouseholdInvitationDto {
  @ApiProperty({
    format: 'email',
    example: 'friend@example.test',
    description: 'Canonical invited email address. Role is server-fixed to MEMBER per D-05.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().normalize('NFC').toLowerCase() : value,
  )
  @IsEmail()
  email!: string;
}

export class SendHouseholdInvitationResponseDto {
  @ApiProperty({ example: 'INVITATION_SENT' })
  code!: 'INVITATION_SENT';

  @ApiProperty({ example: '邀请已发送。' })
  message!: string;
}

// ---- Invitation Accept DTOs ----

export class AcceptInvitationDto {
  @ApiProperty({
    description: 'The raw invitation token from the URL query parameter.',
    example: 'abc123def456',
  })
  @IsString()
  token!: string;
}

export class InvitationPreviewResponseDto {
  @ApiProperty({ enum: ['valid', 'invalid', 'expired', 'used'] })
  kind!: 'valid' | 'invalid' | 'expired' | 'used';

  @ApiProperty({
    required: false,
    example: '温暖小家',
    description: 'Only present when kind is "valid".',
  })
  householdName?: string;

  @ApiProperty({
    required: false,
    example: '家主',
    description: 'Only present when kind is "valid".',
  })
  inviterDisplayName?: string;

  @ApiProperty({
    required: false,
    description: 'ISO 8601 expiry. Only present when kind is "valid".',
  })
  expiresAt?: string;
}

interface AuthenticatedRequest {
  auth: AccessTokenClaims;
}

@ApiTags('households')
@Controller('households')
export class HouseholdsController {
  constructor(private readonly householdsService: HouseholdsService) {}

  // ---- Public invitation preview (no auth — D-07) ----

  @Get('invitations/preview')
  @HttpCode(200)
  @ApiOperation({ operationId: 'previewInvitation' })
  @ApiQuery({ name: 'token', required: true, description: 'Raw invitation token from the URL.' })
  @ApiOkResponse({ type: InvitationPreviewResponseDto })
  async previewInvitation(
    @Query('token') token: string | undefined,
  ): Promise<InvitationPreviewResponseDto> {
    if (typeof token !== 'string' || token.length === 0) {
      return { kind: 'invalid' };
    }
    return this.householdsService.previewInvitation(token);
  }

  // ---- Authenticated invitation accept (D-07/D-08) ----

  @Post('invitations/accept')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'acceptInvitation' })
  @ApiOkResponse({ type: GetHouseholdResponseDto })
  @ApiBadRequestResponse({ description: 'Invitation is invalid, expired, or already used.' })
  @ApiForbiddenResponse({ description: 'The authenticated email does not match the invitation recipient.' })
  @ApiConflictResponse({ description: 'The invitation was already claimed by a concurrent request.' })
  async acceptInvitation(
    @Req() request: AuthenticatedRequest,
    @Body() input: AcceptInvitationDto,
  ): Promise<GetHouseholdResponseDto> {
    if (request.auth === undefined) {
      throw new Error('AccessTokenGuard did not attach verified session claims.');
    }
    return this.householdsService.acceptInvitation(request.auth.sub, input.token);
  }

  // ---- Household CRUD (authenticated) ----

  @Post()
  @HttpCode(201)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'createHousehold' })
  @ApiCreatedResponse({ type: CreateHouseholdResponseDto })
  @ApiBadRequestResponse({ description: 'Household name is invalid or the request is malformed.' })
  async createHousehold(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateHouseholdDto,
  ): Promise<CreateHouseholdResponseDto> {
    if (request.auth === undefined) {
      throw new Error('AccessTokenGuard did not attach verified session claims.');
    }
    return this.householdsService.createHousehold(request.auth.sub, input.name);
  }

  @Get()
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'listMyHouseholds' })
  @ApiOkResponse({ type: ListMyHouseholdsItemDto, isArray: true })
  async listMyHouseholds(
    @Req() request: AuthenticatedRequest,
  ): Promise<ListMyHouseholdsItemDto[]> {
    if (request.auth === undefined) {
      throw new Error('AccessTokenGuard did not attach verified session claims.');
    }
    return this.householdsService.listMyHouseholds(request.auth.sub);
  }

  @Get(':id')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'getHousehold' })
  @ApiOkResponse({ type: GetHouseholdResponseDto })
  @ApiNotFoundResponse({ description: 'Household not found or the actor is not a member.' })
  async getHousehold(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<GetHouseholdResponseDto> {
    if (request.auth === undefined) {
      throw new Error('AccessTokenGuard did not attach verified session claims.');
    }
    const result = await this.householdsService.getHousehold(request.auth.sub, id);
    if (result === null) {
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'Household not found or access denied.',
      });
    }
    return result;
  }

  @Patch(':id')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'updateHousehold' })
  @ApiOkResponse({ type: GetHouseholdResponseDto })
  @ApiBadRequestResponse({ description: 'Household name is invalid or the request is malformed.' })
  @ApiForbiddenResponse({ description: 'The actor is a member but not the current owner.' })
  @ApiNotFoundResponse({ description: 'Household not found or the actor is not a member.' })
  async updateHousehold(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() input: UpdateHouseholdDto,
  ): Promise<GetHouseholdResponseDto> {
    if (request.auth === undefined) {
      throw new Error('AccessTokenGuard did not attach verified session claims.');
    }
    const result = await this.householdsService.updateHousehold(
      request.auth.sub,
      id,
      input.name,
    );
    if (result === null) {
      // Distinguish membership loss (404) from permission change (403).
      const stillMember = await this.householdsService.getHousehold(
        request.auth.sub,
        id,
      );
      if (stillMember !== null) {
        throw new ForbiddenException({
          code: 'INSUFFICIENT_ROLE',
          message: '只有家庭所有者可以重命名家庭。',
        });
      }
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'Household not found or access denied.',
      });
    }
    return result;
  }

  @Post(':id/invitations')
  @HttpCode(201)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'sendHouseholdInvitation' })
  @ApiCreatedResponse({ type: SendHouseholdInvitationResponseDto })
  @ApiBadRequestResponse({ description: 'Email is invalid or the request is malformed.' })
  @ApiConflictResponse({ description: 'The email already belongs to a current member of this household.' })
  @ApiForbiddenResponse({ description: 'Actor is a member but not authorized to send invitations.' })
  @ApiNotFoundResponse({ description: 'Household not found or actor is not a member.' })
  async sendHouseholdInvitation(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() input: SendHouseholdInvitationDto,
  ): Promise<SendHouseholdInvitationResponseDto> {
    if (request.auth === undefined) {
      throw new Error('AccessTokenGuard did not attach verified session claims.');
    }
    return this.householdsService.sendHouseholdInvitation(
      request.auth.sub,
      id,
      input.email,
    );
  }
}
