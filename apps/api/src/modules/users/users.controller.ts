import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessTokenGuard, type AccessTokenClaims } from '../auth/access-token.guard.js';
import { CurrentUserDto, UpdateMeDto } from './dto/update-me.dto.js';
import { UsersService } from './users.service.js';

interface AuthenticatedRequest {
  auth: AccessTokenClaims;
}

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ operationId: 'getMe' })
  @ApiOkResponse({ type: CurrentUserDto })
  getMe(@Req() request: AuthenticatedRequest): Promise<CurrentUserDto> {
    return this.usersService.getMe(request.auth.sub);
  }

  @Patch('me')
  @ApiOperation({ operationId: 'updateMe' })
  @ApiOkResponse({ type: CurrentUserDto })
  updateMe(
    @Req() request: AuthenticatedRequest,
    @Body() input: UpdateMeDto,
  ): Promise<CurrentUserDto> {
    return this.usersService.updateMe(request.auth.sub, input.displayName);
  }
}
