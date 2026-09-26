import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
  ApiNoContentResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
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
  @ApiProperty({ example: 'family-member', description: 'An existing username. Invitations are bound to this account.' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().normalize('NFC') : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  username!: string;
}

export class SendHouseholdInvitationResponseDto {
  @ApiProperty({ example: 'INVITATION_SENT' })
  code!: 'INVITATION_SENT';

  @ApiProperty({ example: '邀请已发送。' })
  message!: string;

  @ApiProperty({ format: 'uuid' })
  invitationId!: string;
}

// ---- Invitation Accept DTOs ----

export class AcceptInvitationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  invitationId!: string;
}

export class InboxInvitationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  householdName!: string;
  @ApiProperty()
  inviterDisplayName!: string;
  @ApiProperty()
  expiresAt!: string;
  @ApiProperty()
  createdAt!: string;
}

export class InvitationInboxResponseDto {
  @ApiProperty({ type: [InboxInvitationDto] })
  invitations!: InboxInvitationDto[];
}

// ---- Invitation Lifecycle DTOs ----

export class InvitationListItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'family-member' })
  username!: string;

  @ApiProperty({ enum: ['pending', 'expired', 'accepted', 'revoked', 'declined'] })
  status!: 'pending' | 'expired' | 'accepted' | 'revoked' | 'declined';

  @ApiProperty({ description: 'ISO 8601 expiry timestamp.' })
  expiresAt!: string;

  @ApiProperty({ example: 'MEMBER' })
  role!: string;

  @ApiProperty({ description: 'ISO 8601 creation timestamp.' })
  createdAt!: string;
}

export class ListInvitationsResponseDto {
  @ApiProperty({ type: [InvitationListItemDto] })
  invitations!: InvitationListItemDto[];
}

export class ResendInvitationResponseDto {
  @ApiProperty({ example: 'INVITATION_RESENT' })
  code!: 'INVITATION_RESENT';

  @ApiProperty({ example: '邀请已重新发送。' })
  message!: string;

  @ApiProperty({ format: 'uuid' })
  invitationId!: string;
}

export class RevokeInvitationResponseDto {
  @ApiProperty({ example: 'INVITATION_REVOKED' })
  code!: 'INVITATION_REVOKED';

  @ApiProperty({ example: '邀请已撤销。' })
  message!: string;
}

// ---- Role Governance DTOs (D-09, D-10) ----

export class ChangeMemberRoleDto {
  @ApiProperty({
    enum: ['ADMIN', 'MEMBER'],
    description: 'Target role. OWNER is never a valid DTO value — ownership transfer uses a separate endpoint.',
    example: 'ADMIN',
  })
  @IsIn(['ADMIN', 'MEMBER'], { message: 'role must be ADMIN or MEMBER' })
  role!: 'ADMIN' | 'MEMBER';
}

// ---- Ownership Transfer DTO (D-10, D-11) ----

export class TransferOwnershipDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Membership ID of the successor who will become the new owner. Must be a different existing member in the same household.',
    example: '00000000-0000-0000-0000-000000000000',
  })
  @IsUUID()
  successorMembershipId!: string;
}

// ---- Owner-Leave DTO (D-11) ----

export class LeaveHouseholdDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Membership ID of the successor who will become the new owner after the current owner leaves. Must be a different existing member in the same household.',
    example: '00000000-0000-0000-0000-000000000000',
  })
  @IsUUID()
  successorMembershipId!: string;
}

interface AuthenticatedRequest {
  auth: AccessTokenClaims;
}

@ApiTags('households')
@Controller('households')
export class HouseholdsController {
  constructor(private readonly householdsService: HouseholdsService) {}

  @Get('invitations/inbox')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'listInvitationInbox' })
  @ApiOkResponse({ type: InvitationInboxResponseDto })
  async listInvitationInbox(@Req() request: AuthenticatedRequest): Promise<InvitationInboxResponseDto> {
    return this.householdsService.listInvitationInbox(request.auth.sub);
  }

  @Post('invitations/decline')
  @HttpCode(204)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'declineInvitation' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Invitation not found for this recipient.' })
  @ApiConflictResponse({ description: 'Invitation is already handled, revoked, or expired.' })
  async declineInvitation(@Req() request: AuthenticatedRequest, @Body() input: AcceptInvitationDto): Promise<void> {
    await this.householdsService.declineInvitation(request.auth.sub, input.invitationId);
  }

  @Post('invitations/accept')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'acceptInvitation' })
  @ApiOkResponse({ type: GetHouseholdResponseDto })
  @ApiBadRequestResponse({ description: 'Invitation ID is malformed.' })
  @ApiNotFoundResponse({ description: 'Invitation not found for this recipient.' })
  @ApiConflictResponse({ description: 'Invitation is already handled, revoked, or expired.' })
  async acceptInvitation(
    @Req() request: AuthenticatedRequest,
    @Body() input: AcceptInvitationDto,
  ): Promise<GetHouseholdResponseDto> {
    if (request.auth === undefined) {
      throw new Error('AccessTokenGuard did not attach verified session claims.');
    }
    return this.householdsService.acceptInvitation(request.auth.sub, input.invitationId);
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
  @ApiBadRequestResponse({ description: 'Username is invalid or the request is malformed.' })
  @ApiConflictResponse({ description: 'The account is already a current member of this household.' })
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
      input,
    );
  }

  // ---- Invitation lifecycle: list, resend, revoke ----

  @Get(':id/invitations')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'listInvitations' })
  @ApiOkResponse({ type: ListInvitationsResponseDto })
  @ApiForbiddenResponse({ description: 'Actor is not an owner or admin of this household.' })
  @ApiNotFoundResponse({ description: 'Household not found or actor is not a member.' })
  async listInvitations(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<ListInvitationsResponseDto> {
    if (request.auth === undefined) {
      throw new Error('AccessTokenGuard did not attach verified session claims.');
    }
    return this.householdsService.listInvitations(request.auth.sub, id);
  }

  @Post(':id/invitations/:invitationId/resend')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'resendInvitation' })
  @ApiOkResponse({ type: ResendInvitationResponseDto })
  @ApiBadRequestResponse({ description: 'Invitation is already accepted, revoked, or cannot be resent.' })
  @ApiForbiddenResponse({ description: 'Actor is not an owner or admin of this household.' })
  @ApiNotFoundResponse({ description: 'Household or invitation not found.' })
  async resendInvitation(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('invitationId') invitationId: string,
  ): Promise<ResendInvitationResponseDto> {
    if (request.auth === undefined) {
      throw new Error('AccessTokenGuard did not attach verified session claims.');
    }
    return this.householdsService.resendInvitation(request.auth.sub, id, invitationId);
  }

  @Post(':id/invitations/:invitationId/revoke')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'revokeInvitation' })
  @ApiOkResponse({ type: RevokeInvitationResponseDto })
  @ApiForbiddenResponse({ description: 'Actor is not an owner or admin of this household.' })
  @ApiNotFoundResponse({ description: 'Household or invitation not found.' })
  async revokeInvitation(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('invitationId') invitationId: string,
  ): Promise<RevokeInvitationResponseDto> {
    if (request.auth === undefined) {
      throw new Error('AccessTokenGuard did not attach verified session claims.');
    }
    return this.householdsService.revokeInvitation(request.auth.sub, id, invitationId);
  }

  // ---- Role governance (D-09, D-10) ----

  @Patch(':id/members/:membershipId/role')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'changeMemberRole' })
  @ApiOkResponse({ type: GetHouseholdResponseDto })
  @ApiBadRequestResponse({ description: 'Requested role is invalid or target already holds that role.' })
  @ApiForbiddenResponse({ description: 'Actor lacks governance rights or is attempting to target the owner.' })
  @ApiConflictResponse({ description: 'Stale membership state or ownership changed during the request.' })
  @ApiNotFoundResponse({ description: 'Household or target membership not found, or actor is not a member.' })
  async changeMemberRole(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('membershipId') targetMembershipId: string,
    @Body() input: ChangeMemberRoleDto,
  ): Promise<GetHouseholdResponseDto> {
    if (request.auth === undefined) {
      throw new Error('AccessTokenGuard did not attach verified session claims.');
    }
    const result = await this.householdsService.changeMemberRole(
      request.auth.sub,
      id,
      targetMembershipId,
      input.role,
    );
    if (result === null) {
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'Household not found or access denied.',
      });
    }
    return result;
  }

  // ---- Member removal (D-09, D-10) ----

  @Delete(':id/members/:membershipId')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'removeMember' })
  @ApiOkResponse({ type: GetHouseholdResponseDto, description: 'Member successfully removed. Returns the authoritative household projection.' })
  @ApiBadRequestResponse({ description: 'Actor is attempting to remove their own membership or the request is malformed.' })
  @ApiForbiddenResponse({ description: 'Actor lacks governance rights or is attempting to target the owner.' })
  @ApiConflictResponse({ description: 'Stale membership state or ownership changed during the request.' })
  @ApiNotFoundResponse({ description: 'Household or target membership not found, or actor is not a member.' })
  async removeMember(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('membershipId') targetMembershipId: string,
  ): Promise<GetHouseholdResponseDto> {
    if (request.auth === undefined) {
      throw new Error('AccessTokenGuard did not attach verified session claims.');
    }
    const result = await this.householdsService.removeMember(
      request.auth.sub,
      id,
      targetMembershipId,
    );
    if (result === null) {
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'Household not found or access denied.',
      });
    }
    return result;
  }

  // ---- Ownership transfer (D-10, D-11) ----

  @Post(':id/ownership/transfer')
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'transferOwnership' })
  @ApiOkResponse({ type: GetHouseholdResponseDto, description: 'Ownership successfully transferred. Returns the authoritative household projection with the new owner.' })
  @ApiBadRequestResponse({ description: 'Successor is the current owner (self-transfer) or the request is malformed.' })
  @ApiForbiddenResponse({ description: 'Actor is not the current owner.' })
  @ApiConflictResponse({ description: 'Stale ownership state or a concurrent transfer changed the owner pointer.' })
  @ApiNotFoundResponse({ description: 'Household or successor membership not found, or actor is not a member.' })
  async transferOwnership(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() input: TransferOwnershipDto,
  ): Promise<GetHouseholdResponseDto> {
    if (request.auth === undefined) {
      throw new Error('AccessTokenGuard did not attach verified session claims.');
    }
    const result = await this.householdsService.transferOwnership(
      request.auth.sub,
      id,
      input.successorMembershipId,
    );
    if (result === null) {
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'Household not found or access denied.',
      });
    }
    return result;
  }

  @Post(':id/leave')
  @HttpCode(204)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'leaveHouseholdMembership' })
  @ApiNoContentResponse({ description: 'Caller left; shared household content is retained.' })
  @ApiForbiddenResponse({ description: 'OWNER_TRANSFER_REQUIRED: transfer ownership before leaving.' })
  @ApiNotFoundResponse({ description: 'Household not found or caller is not a member.' })
  async leaveMembership(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    if (request.auth === undefined) throw new Error('Missing authenticated session.');
    await this.householdsService.leaveMembership(request.auth.sub, id);
  }

  // ---- Owner leave (D-11, D-12) ----

  @Post(':id/ownership/leave')
  @HttpCode(204)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'leaveHousehold' })
  @ApiBadRequestResponse({ description: 'Successor is the current owner (self-leave) or the last member cannot leave.' })
  @ApiForbiddenResponse({ description: 'Actor is not the current owner.' })
  @ApiConflictResponse({ description: 'Stale ownership state or a concurrent transfer/leave changed the owner pointer.' })
  @ApiNotFoundResponse({ description: 'Household or successor membership not found, or actor is not a member.' })
  async leaveHousehold(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() input: LeaveHouseholdDto,
  ): Promise<void> {
    if (request.auth === undefined) {
      throw new Error('AccessTokenGuard did not attach verified session claims.');
    }
    const outcome = await this.householdsService.leaveHousehold(
      request.auth.sub,
      id,
      input.successorMembershipId,
    );
    if (outcome.kind === 'not_found') {
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'Household not found or access denied.',
      });
    }
    // outcome.kind === 'completed' — 204 No Content
  }
}
