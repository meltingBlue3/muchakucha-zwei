import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { isEmail } from 'class-validator';
import * as argon2 from 'argon2';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { MAIL_PORT, type MailPort } from '../../infrastructure/mail/mail.port.js';
import type { RegisterDto } from './dto/register.dto.js';
import { passwordPolicyFailure } from './password-policy.js';

const TOKEN_BYTES = 32;
const VERIFICATION_LIFETIME_MS = 24 * 60 * 60 * 1_000;

interface RegistrationResult {
  readonly pendingProof: string;
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
        verificationUrl: `muchakucha://verify-email?token=${verificationToken}`,
      }).catch(() => undefined);
    }

    return { pendingProof };
  }
}
