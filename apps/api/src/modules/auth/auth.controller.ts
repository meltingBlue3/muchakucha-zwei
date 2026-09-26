import { BadRequestException, Body, Controller, Headers, HttpCode, Post, Req, Res, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiAcceptedResponse, ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { LoginDto, LoginResponseDto } from './dto/login.dto.js';
import { RefreshDto, RefreshResponseDto } from './dto/refresh.dto.js';
import { RegisterDto, RegistrationAcceptedDto } from './dto/register.dto.js';
import { AccessTokenGuard, ALLOW_REVOKED_SESSION, type AccessTokenClaims } from './access-token.guard.js';

const REFRESH_COOKIE_PATH = '/api/v1/auth';
const REFRESH_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

interface CookieReply {
  setCookie(name: string, value: string, options: {
    httpOnly: boolean;
    maxAge: number;
    path: string;
    sameSite: 'lax' | 'none';
    secure: boolean;
  }): void;
}

interface CookieRequest {
  cookies: Record<string, string | undefined>;
}

interface LogoutRequest extends CookieRequest {
  auth?: AccessTokenClaims;
  body?: unknown;
}

function cookieNames(): { refresh: string } {
  const production = process.env.NODE_ENV === 'production';
  return {
    refresh: production ? '__Secure-mk_refresh' : 'mk_refresh_dev',
  };
}

function configuredWebOrigins(): ReadonlySet<string> {
  const configured = process.env.WEB_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean);
  return new Set(configured?.length ? configured : ['http://127.0.0.1:8081']);
}

function isAllowedOrigin(origin: string | undefined): boolean {
  // 非生产环境允许所有来源，便于开发和多设备测试
  if (process.env.NODE_ENV !== 'production') return true;
  if (origin === undefined) return false;
  return configuredWebOrigins().has(origin);
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60 * 1_000 } })
  @ApiOperation({ operationId: 'login' })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiBadRequestResponse({ description: 'Login input or transport is invalid.' })
  async login(
    @Body() input: LoginDto,
    @Headers('origin') origin: string | undefined,
    @Res({ passthrough: true }) reply: CookieReply,
  ): Promise<LoginResponseDto> {
    const browserRequest = origin !== undefined;
    if (
      (input.platform === 'web' && (!browserRequest || !isAllowedOrigin(origin)))
      || (input.platform === 'native' && browserRequest)
    ) {
      throw new BadRequestException({
        code: 'INVALID_LOGIN_TRANSPORT',
        message: 'Login transport is invalid.',
      });
    }
    const result = await this.authService.login(input);
    if (input.platform === 'web') {
      this.setRefreshCookie(reply, result.refreshToken);
      return { accessToken: result.accessToken };
    }
    return result;
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60 * 1_000 } })
  @ApiOperation({ operationId: 'refresh' })
  @ApiOkResponse({ type: RefreshResponseDto })
  @ApiBadRequestResponse({ description: 'Refresh credential transport is invalid.' })
  async refresh(
    @Body() input: RefreshDto,
    @Headers('origin') origin: string | undefined,
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) reply: CookieReply,
  ): Promise<RefreshResponseDto> {
    const names = cookieNames();
    const cookieCredential = request.cookies[names.refresh];
    const bodyCredential = input.refreshToken;
    const browserRequest = origin !== undefined;
    const cookieSource = cookieCredential !== undefined;
    if (
      cookieSource === (bodyCredential !== undefined)
      || (cookieSource && (!browserRequest || !isAllowedOrigin(origin)))
      || (!cookieSource && browserRequest)
    ) {
      throw new BadRequestException({
        code: 'INVALID_REFRESH_TRANSPORT',
        message: 'Refresh credential transport is invalid.',
      });
    }

    const result = await this.authService.refresh(cookieCredential ?? bodyCredential!);
    if (cookieSource) {
      this.setRefreshCookie(reply, result.refreshToken);
      return { accessToken: result.accessToken };
    }
    return result;
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(AccessTokenGuard)
  @SetMetadata(ALLOW_REVOKED_SESSION, true)
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'logout' })
  @ApiNoContentResponse({ description: 'Current device session revoked and Web refresh cookie cleared.' })
  @ApiBadRequestResponse({ description: 'Logout does not accept a user or session target.' })
  async logout(
    @Req() request: LogoutRequest,
    @Res({ passthrough: true }) reply: CookieReply,
  ): Promise<void> {
    if (
      request.body !== undefined
      && (typeof request.body !== 'object' || request.body === null || Object.keys(request.body).length > 0)
    ) {
      throw new BadRequestException({
        code: 'INVALID_LOGOUT_TARGET',
        message: 'Logout does not accept a user or session target.',
      });
    }
    if (request.auth === undefined) {
      throw new Error('AccessTokenGuard did not attach verified session claims.');
    }

    await this.authService.logout(request.auth.sub, request.auth.sid);
    this.clearRefreshCookie(reply);
  }

  @Post('register')
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1_000 } })
  @ApiOperation({ operationId: 'register' })
  @ApiAcceptedResponse({ type: RegistrationAcceptedDto })
  @ApiBadRequestResponse({ description: 'Registration input or transport is invalid.' })
  @ApiConflictResponse({ description: 'The username is already taken.' })
  async register(
    @Body() input: RegisterDto,
    @Headers('origin') origin: string | undefined,
    @Res({ passthrough: true }) reply: CookieReply,
  ): Promise<RegistrationAcceptedDto> {
    const isWeb = input.platform === 'web';
    if ((isWeb && (origin === undefined || !isAllowedOrigin(origin))) || (!isWeb && origin !== undefined)) {
      throw new BadRequestException({
        code: 'INVALID_REGISTRATION_TRANSPORT',
        message: 'Registration transport is invalid.',
      });
    }

    const result = await this.authService.register(input);
    if (isWeb) {
      this.setRefreshCookie(reply, result.refreshToken);
      return { code: 'REGISTRATION_ACCEPTED', accessToken: result.accessToken };
    }
    return { code: 'REGISTRATION_ACCEPTED', ...result };
  }

  private setRefreshCookie(reply: CookieReply, refreshToken: string): void {
    const production = process.env.NODE_ENV === 'production';
    reply.setCookie(cookieNames().refresh, refreshToken, {
      httpOnly: true,
      // Always Secure — localhost is a secure context so browsers accept
      // Secure cookies over HTTP on localhost/127.0.0.1. This is required
      // because SameSite=None without Secure is silently rejected.
      secure: true,
      sameSite: production ? 'lax' : 'none',
      path: REFRESH_COOKIE_PATH,
      maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
    });
  }

  private clearRefreshCookie(reply: CookieReply): void {
    const production = process.env.NODE_ENV === 'production';
    reply.setCookie(cookieNames().refresh, '', {
      httpOnly: true,
      secure: true,
      sameSite: production ? 'lax' : 'none',
      path: REFRESH_COOKIE_PATH,
      maxAge: 0,
    });
  }
}
