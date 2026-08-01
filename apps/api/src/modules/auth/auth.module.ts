import { Module } from '@nestjs/common';
import { MAIL_PORT } from '../../infrastructure/mail/mail.port.js';
import {
  loadSmtpMailConfig,
  SmtpMailAdapter,
} from '../../infrastructure/mail/smtp-mail.adapter.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  providers: [
    AuthService,
    {
      provide: MAIL_PORT,
      useFactory: (): SmtpMailAdapter => new SmtpMailAdapter(loadSmtpMailConfig()),
    },
  ],
  controllers: [AuthController],
  exports: [MAIL_PORT],
})
export class AuthModule {}
