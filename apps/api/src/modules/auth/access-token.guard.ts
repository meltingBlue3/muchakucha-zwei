import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

export interface AccessTokenClaims {
  readonly sub: string;
  readonly sid: string;
}

interface AuthenticatedRequest {
  headers: { authorization?: string };
  auth?: AccessTokenClaims;
}

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : undefined;
    if (!token) throw this.unauthorized();

    try {
      const claims = await this.jwt.verifyAsync<Record<string, unknown>>(token, { algorithms: ['HS256'] });
      if (typeof claims.sub !== 'string' || typeof claims.sid !== 'string') throw this.unauthorized();
      const session = await this.prisma.authSession.findFirst({
        where: {
          id: claims.sid,
          userId: claims.sub,
          revokedAt: null,
          absoluteEndsAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (session === null) throw this.unauthorized();
      request.auth = { sub: claims.sub, sid: claims.sid };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw this.unauthorized();
    }
  }

  private unauthorized(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'INVALID_ACCESS_TOKEN',
      message: 'The access token is invalid or expired.',
    });
  }
}
