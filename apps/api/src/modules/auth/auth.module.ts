import { DynamicModule, Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MAIL_PORT } from '../../infrastructure/mail/mail.port.js';
import { ConsoleMailAdapter } from '../../infrastructure/mail/console-mail.adapter.js';
import { DisabledMailAdapter } from '../../infrastructure/mail/disabled-mail.adapter.js';
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

@Global()
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
          useFactory: (): SmtpMailAdapter | ConsoleMailAdapter | DisabledMailAdapter => {
            if (environment.SMTP_HOST) {
              return new SmtpMailAdapter(loadSmtpMailConfig(environment));
            }
            if (environment.NODE_ENV === 'production') {
              return new DisabledMailAdapter();
            }
            // 开发/测试环境直接输出邮件到控制台，无需 SMTP 服务器
            return new ConsoleMailAdapter();
          },
        },
      ],
      controllers: [AuthController],
      exports: [MAIL_PORT, AccessTokenGuard, JwtModule],
    };
  }
}
