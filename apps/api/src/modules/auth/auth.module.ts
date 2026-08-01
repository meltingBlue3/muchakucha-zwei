import { Module } from '@nestjs/common';
import { MAIL_PORT } from '../../infrastructure/mail/mail.port.js';
import {
  loadSmtpMailConfig,
  SmtpMailAdapter,
} from '../../infrastructure/mail/smtp-mail.adapter.js';

@Module({
  providers: [
    {
      provide: MAIL_PORT,
      useFactory: (): SmtpMailAdapter => new SmtpMailAdapter(loadSmtpMailConfig()),
    },
  ],
  exports: [MAIL_PORT],
})
export class AuthModule {}
