import { BadRequestException, Body, Controller, Headers, HttpCode, Post, Res } from '@nestjs/common';
import { ApiAcceptedResponse, ApiBadRequestResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { RegisterDto, RegistrationAcceptedDto } from './dto/register.dto.js';

const PENDING_PROOF_MAX_AGE_SECONDS = 24 * 60 * 60;
const PENDING_PROOF_PATH = '/api/v1/auth/email-verifications';

interface CookieReply {
  setCookie(name: string, value: string, options: {
    httpOnly: boolean;
    maxAge: number;
    path: string;
    sameSite: 'lax';
    secure: boolean;
  }): void;
}

function configuredWebOrigins(): ReadonlySet<string> {
  const configured = process.env.WEB_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean);
  return new Set(configured?.length ? configured : ['http://127.0.0.1:8081']);
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
}
