import { DynamicModule, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MAIL_PORT } from '../../infrastructure/mail/mail.port.js';
import {
  loadSmtpMailConfig,
  SmtpMailAdapter,
} from '../../infrastructure/mail/smtp-mail.adapter.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AccessTokenGuard } from './access-token.guard.js';

function accessTokenSecret(environment: NodeJS.ProcessEnv): string {
  const secret = environment.JWT_ACCESS_SECRET
    ?? (environment.NODE_ENV === 'production' ? undefined : 'development-only-access-secret-change-before-production');
  if (secret === undefined || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('JWT_ACCESS_SECRET must contain at least 32 bytes.');
  }
  return secret;
}

@Module({})
export class AuthModule {
  static register(environment: NodeJS.ProcessEnv = process.env): DynamicModule {
    return {
      module: AuthModule,
      imports: [
        JwtModule.registerAsync({
          useFactory: () => ({
            secret: accessTokenSecret(environment),
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
    };
  }
}
