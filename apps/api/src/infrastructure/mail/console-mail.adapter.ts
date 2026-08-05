import type {
  HouseholdInvitationMail,
  MailPort,
  PasswordChangedMail,
  PasswordResetMail,
  VerificationMail,
} from './mail.port.js';

/**
 * Dev-only adapter that logs all outgoing mail to the console.
 * No SMTP server needed — just read the links from the terminal output.
 */
export class ConsoleMailAdapter implements MailPort {
  async sendEmailVerification(message: VerificationMail): Promise<void> {
    console.log(SEPARATOR);
    console.log('📧 验证邮件');
    console.log(`   To:      ${message.to}`);
    console.log(`   Subject: Verify your Muchakucha Zwei email`);
    console.log(`   Link:    ${message.verificationUrl}`);
    console.log(SEPARATOR);
  }

  async sendPasswordReset(message: PasswordResetMail): Promise<void> {
    console.log(SEPARATOR);
    console.log('📧 密码重置邮件');
    console.log(`   To:      ${message.to}`);
    console.log(`   Subject: Reset your Muchakucha Zwei password`);
    console.log(`   Link:    ${message.resetUrl}`);
    console.log(SEPARATOR);
  }

  async sendPasswordChangedNotice(message: PasswordChangedMail): Promise<void> {
    console.log(SEPARATOR);
    console.log('📧 密码变更通知');
    console.log(`   To:      ${message.to}`);
    console.log(`   Subject: Your Muchakucha Zwei password was changed`);
    console.log(`   Time:    ${message.changedAt.toISOString()}`);
    console.log(SEPARATOR);
  }

  async sendHouseholdInvitation(message: HouseholdInvitationMail): Promise<void> {
    console.log(SEPARATOR);
    console.log('📧 家庭邀请邮件');
    console.log(`   To:      ${message.to}`);
    console.log(`   From:    ${message.inviterDisplayName}`);
    console.log(`   Family:  ${message.householdDisplayName}`);
    console.log(`   Link:    ${message.invitationUrl}`);
    console.log(`   Expires: ${message.expiresAt.toISOString()}`);
    console.log(SEPARATOR);
  }
}

const SEPARATOR = '─'.repeat(60);
