import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AccessTokenGuard, type AccessTokenClaims } from '../auth/access-token.guard.js';
import {
  CreateHouseholdDto,
  CreateHouseholdResponseDto,
  ListMyHouseholdsItemDto,
} from './dto/create-household.dto.js';
import { GetHouseholdResponseDto } from './dto/membership.dto.js';
import { HouseholdsService } from './households.service.js';

interface AuthenticatedRequest {
  auth: AccessTokenClaims;
}

@ApiTags('households')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('households')
export class HouseholdsController {
  constructor(private readonly householdsService: HouseholdsService) {}

  @Post()
  @HttpCode(201)
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
}
