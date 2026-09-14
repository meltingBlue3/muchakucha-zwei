import { ServiceUnavailableException } from '@nestjs/common';
import type { MailPort } from './mail.port.js';

/** Username accounts do not need mail. Legacy email operations require SMTP. */
export class DisabledMailAdapter implements MailPort {
  private unavailable(): never {
    throw new ServiceUnavailableException({
      code: 'MAIL_NOT_CONFIGURED',
      message: 'Email delivery is not configured.',
    });
  }

  async sendEmailVerification(): Promise<void> { this.unavailable(); }
  async sendPasswordReset(): Promise<void> { this.unavailable(); }
  async sendPasswordChangedNotice(): Promise<void> { this.unavailable(); }
  async sendHouseholdInvitation(): Promise<void> { this.unavailable(); }
}
