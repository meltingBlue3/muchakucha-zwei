export const MAIL_PORT = Symbol('MAIL_PORT');

interface RecipientMail {
  readonly to: string;
  readonly recipientName?: string;
}

export interface VerificationMail extends RecipientMail {
  readonly verificationUrl: string;
}

export interface PasswordResetMail extends RecipientMail {
  readonly resetUrl: string;
}

export interface PasswordChangedMail extends RecipientMail {
  readonly changedAt: Date;
}

export interface MailPort {
  sendEmailVerification(message: VerificationMail): Promise<void>;
  sendPasswordReset(message: PasswordResetMail): Promise<void>;
  sendPasswordChangedNotice(message: PasswordChangedMail): Promise<void>;
}
