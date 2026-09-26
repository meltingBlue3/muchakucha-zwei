import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { LoginDto } from './dto/login.dto.js';

const TOKEN_BYTES = 32;
const REFRESH_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;
const SESSION_ABSOLUTE_LIFETIME_MS = 90 * 24 * 60 * 60 * 1_000;

interface SessionCredentials {
  readonly accessToken: string;
  readonly refreshToken: string;
}

function opaqueToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function validationError(field: string, code: string): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    message: 'Request validation failed.',
    details: [{ field, codes: [code] }],
  });
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(input: LoginDto): Promise<SessionCredentials> {
    const user = await this.prisma.user.findUnique({ where: { usernameCanonical: input.username.trim().normalize('NFC').toLowerCase() } });
    const passwordMatches = user === null
      ? await argon2.hash(input.password, {
        type: argon2.argon2id,
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
      }).then(() => false)
      : await argon2.verify(user.passwordHash, input.password).catch(() => false);

    if (user === null || !passwordMatches) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'The username or password is incorrect.',
      });
    }
    const now = new Date();
    const refreshToken = opaqueToken();
    const session = await this.prisma.authSession.create({
      data: {
        userId: user.id,
        absoluteEndsAt: new Date(now.getTime() + SESSION_ABSOLUTE_LIFETIME_MS),
        refreshTokens: {
          create: {
            tokenHash: hashOpaqueToken(refreshToken),
            expiresAt: new Date(now.getTime() + REFRESH_LIFETIME_MS),
          },
        },
      },
      select: { id: true },
    });
    return {
      accessToken: await this.signAccessToken(user.id, session.id),
      refreshToken,
    };
  }

  async refresh(refreshToken: string): Promise<SessionCredentials> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const outcome = await this.prisma.$transaction(async (transaction) => {
          const now = new Date();
          const current = await transaction.refreshToken.findUnique({
            where: { tokenHash: hashOpaqueToken(refreshToken) },
            include: { session: true },
          });
          if (current === null) return { kind: 'invalid' } as const;

          if (current.consumedAt !== null) {
            await transaction.authSession.updateMany({
              where: { id: current.sessionId, revokedAt: null },
              data: { compromisedAt: now, revokedAt: now },
            });
            return { kind: 'replayed' } as const;
          }
          if (
            current.expiresAt <= now
            || current.session.revokedAt !== null
            || current.session.absoluteEndsAt <= now
          ) {
            return { kind: 'invalid' } as const;
          }

          const claimed = await transaction.refreshToken.updateMany({
            where: { id: current.id, consumedAt: null, expiresAt: { gt: now } },
            data: { consumedAt: now },
          });
          if (claimed.count !== 1) {
            await transaction.authSession.updateMany({
              where: { id: current.sessionId, revokedAt: null },
              data: { compromisedAt: now, revokedAt: now },
            });
            return { kind: 'replayed' } as const;
          }

          const successor = opaqueToken();
          await transaction.refreshToken.create({
            data: {
              sessionId: current.sessionId,
              parentId: current.id,
              tokenHash: hashOpaqueToken(successor),
              expiresAt: new Date(Math.min(
                now.getTime() + REFRESH_LIFETIME_MS,
                current.session.absoluteEndsAt.getTime(),
              )),
            },
          });
          await transaction.authSession.update({
            where: { id: current.sessionId },
            data: { lastSeenAt: now },
          });
          return {
            kind: 'rotated',
            refreshToken: successor,
            sessionId: current.sessionId,
            userId: current.session.userId,
          } as const;
        }, { isolationLevel: 'Serializable' });

        if (outcome.kind === 'replayed') {
          throw new UnauthorizedException({
            code: 'REFRESH_REPLAYED',
            message: 'The refresh credential was already used.',
          });
        }
        if (outcome.kind === 'invalid') {
          throw new UnauthorizedException({
            code: 'INVALID_REFRESH_TOKEN',
            message: 'The refresh credential is invalid or expired.',
          });
        }
        return {
          accessToken: await this.signAccessToken(outcome.userId, outcome.sessionId),
          refreshToken: outcome.refreshToken,
        };
      } catch (error) {
        if (this.isSerializationConflict(error) && attempt < 2) continue;
        throw error;
      }
    }
    throw new Error('Refresh rotation retry budget exhausted.');
  }

  async logout(userId: string, sessionId: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  async register(input: RegisterDto): Promise<SessionCredentials> {
    const { password, confirmPassword } = input;
    const username = input.username.trim().normalize('NFC');
    if (Array.from(username).length < 3 || Array.from(username).length > 32 || !/^[\p{L}\p{N}._-]+$/u.test(username)) {
      throw validationError('username', 'INVALID_USERNAME');
    }
    if (Array.from(password).length < 8 || Array.from(password).length > 128) {
      throw validationError('password', 'length');
    }
    if (confirmPassword !== password) {
      throw validationError('confirmPassword', 'PASSWORD_MISMATCH');
    }
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    const refreshToken = opaqueToken();
    const now = new Date();
    try {
      const user = await this.prisma.user.create({
        data: {
          username,
          usernameCanonical: username.toLowerCase(),
          displayName: username,
          passwordHash,
          sessions: {
            create: {
              absoluteEndsAt: new Date(now.getTime() + SESSION_ABSOLUTE_LIFETIME_MS),
              refreshTokens: {
                create: {
                  tokenHash: hashOpaqueToken(refreshToken),
                  expiresAt: new Date(now.getTime() + REFRESH_LIFETIME_MS),
                },
              },
            },
          },
        },
        select: { id: true, sessions: { select: { id: true } } },
      });
      return {
        accessToken: await this.signAccessToken(user.id, user.sessions[0]!.id),
        refreshToken,
      };
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new ConflictException({ code: 'USERNAME_TAKEN', message: 'This username is already taken.' });
      }
      throw error;
    }
  }

  private signAccessToken(userId: string, sessionId: string): Promise<string> {
    return this.jwt.signAsync({ sub: userId, sid: sessionId });
  }

  private isSerializationConflict(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034';
  }

}
