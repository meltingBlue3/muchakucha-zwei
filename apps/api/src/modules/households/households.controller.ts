import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AccessTokenGuard, type AccessTokenClaims } from '../auth/access-token.guard.js';
import {
  CreateHouseholdDto,
  CreateHouseholdResponseDto,
} from './dto/create-household.dto.js';
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
}
