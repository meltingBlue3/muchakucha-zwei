import { BadRequestException, Body, Controller, Headers, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiAcceptedResponse, ApiBadRequestResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { LoginDto, LoginResponseDto } from './dto/login.dto.js';
import { RefreshDto, RefreshResponseDto } from './dto/refresh.dto.js';
import { RegisterDto, RegistrationAcceptedDto } from './dto/register.dto.js';
import {
  CompleteEmailVerificationDto,
  CompleteEmailVerificationResponseDto,
} from './dto/complete-email-verification.dto.js';
import {
  ResendEmailVerificationDto,
  ResendEmailVerificationResponseDto,
} from './dto/resend-email-verification.dto.js';
import {
  PasswordResetRequestAcceptedDto,
  RequestPasswordResetDto,
} from './dto/request-password-reset.dto.js';
import { CompletePasswordResetDto } from './dto/complete-password-reset.dto.js';

const PENDING_PROOF_MAX_AGE_SECONDS = 24 * 60 * 60;
const PENDING_PROOF_PATH = '/api/v1/auth/email-verifications';
const REFRESH_COOKIE_PATH = '/api/v1/auth';
const REFRESH_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

interface CookieReply {
  setCookie(name: string, value: string, options: {
    httpOnly: boolean;
    maxAge: number;
    path: string;
    sameSite: 'lax';
    secure: boolean;
  }): void;
}

interface CookieRequest {
  cookies: Record<string, string | undefined>;
}

function cookieNames(): { pending: string; refresh: string } {
  const production = process.env.NODE_ENV === 'production';
  return {
    pending: production ? '__Secure-mk_pending_proof' : 'mk_pending_proof_dev',
    refresh: production ? '__Secure-mk_refresh' : 'mk_refresh_dev',
  };
}

function configuredWebOrigins(): ReadonlySet<string> {
  const configured = process.env.WEB_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean);
  return new Set(configured?.length ? configured : ['http://127.0.0.1:8081']);
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
      (input.platform === 'web' && (!browserRequest || !configuredWebOrigins().has(origin)))
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
      || (cookieSource && (!browserRequest || !configuredWebOrigins().has(origin)))
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

  @Post('register')
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1_000 } })
  @ApiOperation({ operationId: 'register' })
  @ApiAcceptedResponse({ type: RegistrationAcceptedDto })
  @ApiBadRequestResponse({ description: 'Registration input or transport is invalid.' })
  async register(
    @Body() input: RegisterDto,
    @Headers('origin') origin: string | undefined,
    @Res({ passthrough: true }) reply: CookieReply,
  ): Promise<RegistrationAcceptedDto> {
    const isWeb = input.platform === 'web';
    if ((isWeb && (origin === undefined || !configuredWebOrigins().has(origin))) || (!isWeb && origin !== undefined)) {
      throw new BadRequestException({
        code: 'INVALID_REGISTRATION_TRANSPORT',
        message: 'Registration transport is invalid.',
      });
    }

    const result = await this.authService.register(input);
    if (isWeb) {
      const production = process.env.NODE_ENV === 'production';
      reply.setCookie(production ? '__Secure-mk_pending_proof' : 'mk_pending_proof_dev', result.pendingProof, {
        httpOnly: true,
        secure: production,
        sameSite: 'lax',
        path: PENDING_PROOF_PATH,
        maxAge: PENDING_PROOF_MAX_AGE_SECONDS,
      });
      return { code: 'REGISTRATION_ACCEPTED' };
    }

    return { code: 'REGISTRATION_ACCEPTED', pendingProof: result.pendingProof };
  }

  @Post('email-verifications/complete')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60 * 60 * 1_000 } })
  @ApiOperation({ operationId: 'completeEmailVerification' })
  @ApiOkResponse({ type: CompleteEmailVerificationResponseDto })
  @ApiBadRequestResponse({ description: 'Verification input or transport is invalid.' })
  async completeEmailVerification(
    @Body() input: CompleteEmailVerificationDto,
    @Headers('origin') origin: string | undefined,
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) reply: CookieReply,
  ): Promise<CompleteEmailVerificationResponseDto> {
    const names = cookieNames();
    const browserRequest = origin !== undefined;
    if ((browserRequest && !configuredWebOrigins().has(origin)) || (browserRequest && input.platform === 'native')) {
      throw new BadRequestException({
        code: 'INVALID_VERIFICATION_TRANSPORT',
        message: 'Verification transport is invalid.',
      });
    }
    if (!browserRequest && input.pendingProof !== undefined && input.platform !== 'native') {
      throw new BadRequestException({
        code: 'INVALID_VERIFICATION_TRANSPORT',
        message: 'Verification transport is invalid.',
      });
    }

    const pendingProof = browserRequest ? request.cookies[names.pending] : input.pendingProof;
    const result = await this.authService.completeEmailVerification({
      token: input.token,
      ...(pendingProof === undefined ? {} : { pendingProof }),
      ...(browserRequest ? { proofSource: 'web' as const } : input.platform === 'native' ? { proofSource: 'native' as const } : {}),
    });
    const production = process.env.NODE_ENV === 'production';
    if (browserRequest) {
      if (result.outcome === 'verified_auto_login' && result.refreshToken !== undefined) {
        reply.setCookie(names.refresh, result.refreshToken, {
          httpOnly: true,
          secure: production,
          sameSite: 'lax',
          path: REFRESH_COOKIE_PATH,
          maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
        });
      }
      reply.setCookie(names.pending, '', {
        httpOnly: true,
        secure: production,
        sameSite: 'lax',
        path: PENDING_PROOF_PATH,
        maxAge: 0,
      });
    }

    return {
      outcome: result.outcome,
      ...(result.accessToken === undefined ? {} : { accessToken: result.accessToken }),
      ...(!browserRequest && result.refreshToken !== undefined ? { refreshToken: result.refreshToken } : {}),
    };
  }

  @Post('email-verifications/resend')
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1_000 } })
  @ApiOperation({ operationId: 'resendEmailVerification' })
  @ApiAcceptedResponse({ type: ResendEmailVerificationResponseDto })
  async resendEmailVerification(
    @Body() input: ResendEmailVerificationDto,
  ): Promise<ResendEmailVerificationResponseDto> {
    return this.authService.resendEmailVerification(input.email);
  }

  @Post('password-reset/request')
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1_000 } })
  @ApiOperation({ operationId: 'requestPasswordReset' })
  @ApiAcceptedResponse({ type: PasswordResetRequestAcceptedDto })
  @ApiBadRequestResponse({ description: 'Password reset request input is invalid.' })
  async requestPasswordReset(
    @Body() input: RequestPasswordResetDto,
  ): Promise<PasswordResetRequestAcceptedDto> {
    return this.authService.requestPasswordReset(input.email);
  }

  @Post('password-reset/complete')
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60 * 60 * 1_000 } })
  @ApiOperation({ operationId: 'completePasswordReset' })
  @ApiNoContentResponse({ description: 'Password changed and all existing sessions revoked.' })
  @ApiBadRequestResponse({ description: 'Password or reset credential is invalid.' })
  async completePasswordReset(@Body() input: CompletePasswordResetDto): Promise<void> {
    await this.authService.completePasswordReset(input.token, input.password);
  }

  private setRefreshCookie(reply: CookieReply, refreshToken: string): void {
    const production = process.env.NODE_ENV === 'production';
    reply.setCookie(cookieNames().refresh, refreshToken, {
      httpOnly: true,
      secure: production,
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
    });
  }
}
