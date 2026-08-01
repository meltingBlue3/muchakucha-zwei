import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { isEmail } from 'class-validator';
import * as argon2 from 'argon2';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { MAIL_PORT, type MailPort } from '../../infrastructure/mail/mail.port.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { VerificationOutcome } from './dto/complete-email-verification.dto.js';
import { passwordPolicyFailure } from './password-policy.js';

const TOKEN_BYTES = 32;
const VERIFICATION_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const RESEND_COOLDOWN_MS = 60 * 1_000;
const REFRESH_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;
const SESSION_ABSOLUTE_LIFETIME_MS = 90 * 24 * 60 * 60 * 1_000;

interface RegistrationResult {
  readonly pendingProof: string;
}

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

function verificationUrl(token: string, environment: NodeJS.ProcessEnv = process.env): string {
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
  const link = new URL('/auth/verify-email', parsed);
  link.searchParams.set('token', token);
  return link.href;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAIL_PORT) private readonly mailPort: MailPort,
  ) {}

  async register(input: RegisterDto): Promise<RegistrationResult> {
    const emailCanonical = input.email.trim().normalize('NFC').toLowerCase();
    const deliveryEmail = input.email.trim().normalize('NFC');
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
            email: input.email,
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
    const accessToken = proofMatches ? opaqueToken() : undefined;

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

      if (proofMatches && refreshToken !== undefined) {
        await transaction.authSession.create({
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
        });
      }

      return { kind: proofMatches ? 'auto_login' : 'login_required' } as const;
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
      ...(accessToken === undefined ? {} : { accessToken }),
      ...(refreshToken === undefined ? {} : { refreshToken }),
      ...(input.proofSource === undefined ? {} : { proofSource: input.proofSource }),
    };
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
    if (outcome.kind === 'created') {
      void this.mailPort.sendEmailVerification({
        to: outcome.user.email.trim().normalize('NFC'),
        recipientName: outcome.user.displayName,
        verificationUrl: verificationUrl(nextToken),
      }).catch(() => undefined);
    }
    return { code: 'RESEND_ACCEPTED', retryAfterSeconds: 60 };
  }
}
