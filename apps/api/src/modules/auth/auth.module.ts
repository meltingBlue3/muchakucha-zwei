import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MAIL_PORT } from '../../infrastructure/mail/mail.port.js';
import {
  loadSmtpMailConfig,
  SmtpMailAdapter,
} from '../../infrastructure/mail/smtp-mail.adapter.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AccessTokenGuard } from './access-token.guard.js';

function accessTokenSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET
    ?? (process.env.NODE_ENV === 'production' ? undefined : 'development-only-access-secret-change-before-production');
  if (secret === undefined || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('JWT_ACCESS_SECRET must contain at least 32 bytes.');
  }
  return secret;
}

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: accessTokenSecret(),
        signOptions: { algorithm: 'HS256', expiresIn: 15 * 60 },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  providers: [
    AuthService,
    AccessTokenGuard,
    {
      provide: MAIL_PORT,
      useFactory: (): SmtpMailAdapter => new SmtpMailAdapter(loadSmtpMailConfig()),
    },
  ],
  controllers: [AuthController],
  exports: [MAIL_PORT, AccessTokenGuard, JwtModule],
})
export class AuthModule {}
