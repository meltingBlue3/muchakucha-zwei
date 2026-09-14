import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { isEmail } from 'class-validator';
import * as argon2 from 'argon2';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { MAIL_PORT, type MailPort } from '../../infrastructure/mail/mail.port.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { VerificationOutcome } from './dto/complete-email-verification.dto.js';
import { passwordPolicyFailure } from './password-policy.js';

const TOKEN_BYTES = 32;
const VERIFICATION_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const PASSWORD_RESET_LIFETIME_MS = 30 * 60 * 1_000;
const RESEND_COOLDOWN_MS = 60 * 1_000;
const REFRESH_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;
const SESSION_ABSOLUTE_LIFETIME_MS = 90 * 24 * 60 * 60 * 1_000;

type RegistrationResult = { readonly pendingProof: string } | SessionCredentials;

interface CompleteVerificationInput {
  readonly token: string;
  readonly pendingProof?: string;
  readonly proofSource?: 'native' | 'web';
}

interface CompleteVerificationResult {
  readonly outcome: VerificationOutcome;
  readonly accessToken?: string;
  readonly refreshToken?: string;
  readonly proofSource?: 'native' | 'web';
}

interface ResendVerificationResult {
  readonly code: 'RESEND_ACCEPTED';
  readonly retryAfterSeconds: number;
}

interface RequestPasswordResetResult {
  readonly code: 'PASSWORD_RESET_REQUEST_ACCEPTED';
}

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

function emailLink(path: string, token: string, environment: NodeJS.ProcessEnv = process.env): string {
  const configuredOrigin = environment.EMAIL_LINK_ORIGIN;
  if (environment.NODE_ENV === 'production' && !configuredOrigin) {
    throw new Error('EMAIL_LINK_ORIGIN is required in production.');
  }
  const origin = configuredOrigin ?? 'http://127.0.0.1:8081';
  const parsed = new URL(origin);
  if (
    !['http:', 'https:'].includes(parsed.protocol)
    || parsed.origin !== origin
    || parsed.pathname !== '/'
    || parsed.search !== ''
    || parsed.hash !== ''
    || parsed.username !== ''
    || parsed.password !== ''
  ) {
    throw new Error('EMAIL_LINK_ORIGIN must be an exact HTTP(S) origin.');
  }
  const link = new URL(path, parsed);
  link.searchParams.set('token', token);
  return link.href;
}

function verificationUrl(token: string, environment: NodeJS.ProcessEnv = process.env): string {
  return emailLink('/auth/verify-email', token, environment);
}

function passwordResetUrl(token: string, environment: NodeJS.ProcessEnv = process.env): string {
  return emailLink('/auth/reset-password', token, environment);
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(MAIL_PORT) private readonly mailPort: MailPort,
  ) {}

  async login(input: LoginDto): Promise<SessionCredentials> {
    if ((input.username !== undefined) === (input.email !== undefined)) {
      throw validationError('username', 'EXACTLY_ONE_IDENTITY');
    }
    const identity = input.username !== undefined
      ? { usernameCanonical: input.username.trim().normalize('NFC').toLowerCase() }
      : { emailCanonical: input.email!.trim().normalize('NFC').toLowerCase() };
    const user = await this.prisma.user.findUnique({ where: identity });
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
        message: input.username === undefined
          ? 'The email or password is incorrect.'
          : 'The username or password is incorrect.',
      });
    }
    if (user.username === null && user.emailVerifiedAt === null) {
      throw new ForbiddenException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Verify your email before signing in.',
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

  async register(input: RegisterDto): Promise<RegistrationResult> {
    if (input.username !== undefined) {
      if (input.email !== undefined || input.displayName !== undefined) {
        throw validationError('username', 'EXACTLY_ONE_IDENTITY');
      }
      return this.registerUsername(input.username, input.password, input.confirmPassword);
    }
    if (input.email === undefined || input.displayName === undefined || input.confirmPassword !== undefined) {
      throw validationError('username', 'EXACTLY_ONE_IDENTITY');
    }
    const email = input.email;
    const emailCanonical = email.trim().normalize('NFC').toLowerCase();
    const deliveryEmail = email.trim().normalize('NFC');
    const displayName = input.displayName.trim();
    if (!isEmail(emailCanonical)) {
      throw validationError('email', 'isEmail');
    }
    if (displayName.length === 0 || Array.from(displayName).length > 80) {
      throw validationError('displayName', 'length');
    }
    const policyFailure = passwordPolicyFailure(input.password);
    if (policyFailure !== undefined) {
      throw validationError('password', policyFailure);
    }

    // Perform the expensive KDF before identity lookup so duplicate registration
    // follows the same dominant processing path as a new identity.
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    const verificationToken = opaqueToken();
    const pendingProof = opaqueToken();
    const expiresAt = new Date(Date.now() + VERIFICATION_LIFETIME_MS);

    let created = false;
    try {
      await this.prisma.$transaction(async (transaction) => {
        const user = await transaction.user.create({
          data: {
            email,
            emailCanonical,
            displayName,
            passwordHash,
          },
        });
        await transaction.emailVerificationToken.create({
          data: {
            userId: user.id,
            tokenHash: hashOpaqueToken(verificationToken),
            pendingProofHash: hashOpaqueToken(pendingProof),
            expiresAt,
          },
        });
      });
      created = true;
    } catch (error) {
      if (!isUniqueConflict(error)) {
        throw error;
      }
    }

    if (created) {
      // Delivery starts only after commit and is kept outside the public response
      // latency so existing and new canonical identities retain the same 202 path.
      void this.mailPort.sendEmailVerification({
        to: deliveryEmail,
        recipientName: displayName,
        verificationUrl: verificationUrl(verificationToken),
      }).catch(() => undefined);
    }

    return { pendingProof };
  }

  private async registerUsername(usernameInput: string, password: string, confirmPassword: string | undefined): Promise<SessionCredentials> {
    const username = usernameInput.trim().normalize('NFC');
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

  async requestPasswordReset(email: string): Promise<RequestPasswordResetResult> {
    const emailCanonical = email.trim().normalize('NFC').toLowerCase();
    if (!isEmail(emailCanonical)) {
      throw validationError('email', 'isEmail');
    }

    const now = new Date();
    const token = opaqueToken();
    const outcome = await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({ where: { emailCanonical } });
      if (user === null) return { kind: 'generic' } as const;

      await transaction.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          consumedAt: null,
          invalidatedAt: null,
          expiresAt: { gt: now },
        },
        data: { invalidatedAt: now },
      });
      await transaction.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashOpaqueToken(token),
          createdAt: now,
          expiresAt: new Date(now.getTime() + PASSWORD_RESET_LIFETIME_MS),
        },
      });
      return { kind: 'created', user } as const;
    }, { isolationLevel: 'Serializable' });

    if (outcome.kind === 'created' && outcome.user.email !== null) {
      void this.mailPort.sendPasswordReset({
        to: outcome.user.email.trim().normalize('NFC'),
        recipientName: outcome.user.displayName,
        resetUrl: passwordResetUrl(token),
      }).catch(() => undefined);
    }
    return { code: 'PASSWORD_RESET_REQUEST_ACCEPTED' };
  }

  async completePasswordReset(token: string, password: string): Promise<void> {
    const policyFailure = passwordPolicyFailure(password);
    if (policyFailure !== undefined) {
      throw validationError('password', policyFailure);
    }

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const outcome = await this.prisma.$transaction(async (transaction) => {
          const now = new Date();
          const current = await transaction.passwordResetToken.findUnique({
            where: { tokenHash: hashOpaqueToken(token) },
            include: { user: true },
          });
          if (
            current === null
            || current.consumedAt !== null
            || current.invalidatedAt !== null
            || current.expiresAt <= now
          ) {
            return { kind: 'invalid' } as const;
          }

          const claimed = await transaction.passwordResetToken.updateMany({
            where: {
              id: current.id,
              consumedAt: null,
              invalidatedAt: null,
              expiresAt: { gt: now },
            },
            data: { consumedAt: now },
          });
          if (claimed.count !== 1) return { kind: 'invalid' } as const;

          await transaction.user.update({
            where: { id: current.userId },
            data: { passwordHash },
          });
          await transaction.authSession.updateMany({
            where: { userId: current.userId, revokedAt: null },
            data: { revokedAt: now },
          });
          return { kind: 'completed', user: current.user, changedAt: now } as const;
        }, { isolationLevel: 'Serializable' });

        if (outcome.kind === 'invalid') {
          throw new BadRequestException({
            code: 'INVALID_PASSWORD_RESET_TOKEN',
            message: 'The password reset credential is invalid or expired.',
          });
        }
        if (outcome.user.email !== null) {
          void this.mailPort.sendPasswordChangedNotice({
            to: outcome.user.email.trim().normalize('NFC'),
            recipientName: outcome.user.displayName,
            changedAt: outcome.changedAt,
          }).catch(() => undefined);
        }
        return;
      } catch (error) {
        if (this.isSerializationConflict(error) && attempt < 2) continue;
        throw error;
      }
    }
    throw new Error('Password reset retry budget exhausted.');
  }

  async completeEmailVerification(input: CompleteVerificationInput): Promise<CompleteVerificationResult> {
    const now = new Date();
    const token = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashOpaqueToken(input.token) },
    });
    if (token === null) {
      return { outcome: 'invalid' };
    }
    if (token.consumedAt !== null) {
      return { outcome: 'used' };
    }
    if (token.invalidatedAt !== null) {
      return { outcome: 'superseded' };
    }
    if (token.expiresAt <= now) {
      return { outcome: 'expired' };
    }

    const suppliedProofHash = input.pendingProof === undefined ? undefined : hashOpaqueToken(input.pendingProof);
    const proofMatches = suppliedProofHash !== undefined
      && token.pendingProofHash !== null
      && suppliedProofHash === token.pendingProofHash;
    const refreshToken = proofMatches ? opaqueToken() : undefined;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const outcome = await this.prisma.$transaction(async (transaction) => {
          const claimed = await transaction.emailVerificationToken.updateMany({
            where: {
              id: token.id,
              consumedAt: null,
              invalidatedAt: null,
              expiresAt: { gt: now },
            },
            data: { consumedAt: now, pendingProofHash: null },
          });
          if (claimed.count !== 1) {
            return { kind: 'lost_claim' } as const;
          }

          await transaction.user.update({
            where: { id: token.userId },
            data: { emailVerifiedAt: now },
          });

          let sessionId: string | undefined;
          if (proofMatches && refreshToken !== undefined) {
            const session = await transaction.authSession.create({
              data: {
                userId: token.userId,
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
            sessionId = session.id;
          }

          return proofMatches && sessionId !== undefined
            ? { kind: 'auto_login', sessionId } as const
            : { kind: 'login_required' } as const;
        }, { isolationLevel: 'Serializable' });

        if (outcome.kind === 'lost_claim') {
          const current = await this.prisma.emailVerificationToken.findUnique({ where: { id: token.id } });
          if (current !== null && current.consumedAt !== null) return { outcome: 'used' };
          if (current !== null && current.invalidatedAt !== null) return { outcome: 'superseded' };
          if (current !== null && current.expiresAt <= new Date()) return { outcome: 'expired' };
          return { outcome: 'invalid' };
        }

        if (outcome.kind === 'login_required') {
          return { outcome: 'verified_login_required' };
        }

        return {
          outcome: 'verified_auto_login',
          accessToken: await this.signAccessToken(token.userId, outcome.sessionId),
          ...(refreshToken === undefined ? {} : { refreshToken }),
          ...(input.proofSource === undefined ? {} : { proofSource: input.proofSource }),
        };
      } catch (error) {
        if (this.isSerializationConflict(error) && attempt < 2) continue;
        throw error;
      }
    }
    throw new Error('Email verification retry budget exhausted.');
  }

  private signAccessToken(userId: string, sessionId: string): Promise<string> {
    return this.jwt.signAsync({ sub: userId, sid: sessionId });
  }

  private isSerializationConflict(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034';
  }

  async resendEmailVerification(email: string): Promise<ResendVerificationResult> {
    const emailCanonical = email.trim().normalize('NFC').toLowerCase();
    if (!isEmail(emailCanonical)) {
      throw validationError('email', 'isEmail');
    }
    const now = new Date();
    const nextToken = opaqueToken();

    const outcome = await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({ where: { emailCanonical } });
      if (user === null || user.emailVerifiedAt !== null) {
        return { kind: 'generic' } as const;
      }
      const current = await transaction.emailVerificationToken.findFirst({
        where: { userId: user.id, consumedAt: null, invalidatedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      if (current !== null) {
        const remainingMs = RESEND_COOLDOWN_MS - (now.getTime() - current.createdAt.getTime());
        if (remainingMs > 0) {
          return { kind: 'cooldown', retryAfterSeconds: Math.ceil(remainingMs / 1_000) } as const;
        }
        await transaction.emailVerificationToken.update({
          where: { id: current.id },
          data: { invalidatedAt: now, pendingProofHash: null },
        });
      }
      await transaction.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash: hashOpaqueToken(nextToken),
          ...(current === null ? {} : { pendingProofHash: current.pendingProofHash }),
          expiresAt: new Date(now.getTime() + VERIFICATION_LIFETIME_MS),
        },
      });
      return { kind: 'created', user } as const;
    }, { isolationLevel: 'Serializable' });

    if (outcome.kind === 'cooldown') {
      throw new HttpException({
        code: 'RESEND_NOT_ELIGIBLE',
        message: 'Email verification cannot be resent yet.',
        retryAfterSeconds: outcome.retryAfterSeconds,
      }, HttpStatus.TOO_MANY_REQUESTS);
    }
    if (outcome.kind === 'created' && outcome.user.email !== null) {
      void this.mailPort.sendEmailVerification({
        to: outcome.user.email.trim().normalize('NFC'),
        recipientName: outcome.user.displayName,
        verificationUrl: verificationUrl(nextToken),
      }).catch(() => undefined);
    }
    return { code: 'RESEND_ACCEPTED', retryAfterSeconds: 60 };
  }
}
