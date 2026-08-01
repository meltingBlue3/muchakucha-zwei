import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';
import type {
  MailPort,
  PasswordChangedMail,
  PasswordResetMail,
  VerificationMail,
} from './mail.port.js';

type Environment = NodeJS.ProcessEnv;

export interface SmtpMailConfig {
  readonly auth?: {
    readonly user: string;
    readonly pass: string;
  };
  readonly from: string;
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
}

function requireProductionValue(
  environment: Environment,
  key: keyof Environment,
): string {
  const value = environment[key];
  if (value === undefined || value.trim() === '') {
    throw new Error(`${String(key)} is required in production.`);
  }
  return value;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('SMTP_PORT must be an integer between 1 and 65535.');
  }
  return port;
}

function parseSecure(value: string): boolean {
  if (value !== 'true' && value !== 'false') {
    throw new Error('SMTP_SECURE must be true or false.');
  }
  return value === 'true';
}

function assertSafeHeader(value: string, name: string): string {
  if (/\r|\n/.test(value) || value.trim() === '') {
    throw new Error(`${name} must be a non-empty single-line value.`);
  }
  return value;
}

export function loadSmtpMailConfig(environment: Environment = process.env): SmtpMailConfig {
  const production = environment.NODE_ENV === 'production';
  const host = production
    ? requireProductionValue(environment, 'SMTP_HOST')
    : environment.SMTP_HOST ?? '127.0.0.1';
  const portValue = production
    ? requireProductionValue(environment, 'SMTP_PORT')
    : environment.SMTP_PORT ?? environment.TEST_MAILPIT_SMTP_PORT ?? '11025';
  const secureValue = production
    ? requireProductionValue(environment, 'SMTP_SECURE')
    : environment.SMTP_SECURE ?? 'false';
  const from = production
    ? requireProductionValue(environment, 'SMTP_FROM')
    : environment.SMTP_FROM ?? 'no-reply@muchakucha.test';

  if (!production) {
    return {
      from: assertSafeHeader(from, 'SMTP_FROM'),
      host,
      port: parsePort(portValue),
      secure: parseSecure(secureValue),
    };
  }

  return {
    auth: {
      user: requireProductionValue(environment, 'SMTP_USER'),
      pass: requireProductionValue(environment, 'SMTP_PASSWORD'),
    },
    from: assertSafeHeader(from, 'SMTP_FROM'),
    host,
    port: parsePort(portValue),
    secure: parseSecure(secureValue),
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeHttpUrl(value: string, name: string): string {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username !== '' || parsed.password !== '') {
    throw new Error(`${name} must be an HTTP(S) URL without embedded credentials.`);
  }
  return parsed.href;
}

function greeting(recipientName: string | undefined): string {
  return recipientName === undefined ? 'Hello' : `Hello ${recipientName}`;
}

export class SmtpMailAdapter implements MailPort {
  private readonly transport: Pick<Transporter, 'sendMail'>;

  constructor(
    private readonly config: SmtpMailConfig,
    transport?: Pick<Transporter, 'sendMail'>,
  ) {
    this.transport = transport ?? nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      ...(config.auth === undefined ? {} : { auth: config.auth }),
    });
  }

  async sendEmailVerification(message: VerificationMail): Promise<void> {
    const verificationUrl = safeHttpUrl(message.verificationUrl, 'verificationUrl');
    await this.send({
      to: message.to,
      subject: 'Verify your Muchakucha Zwei email',
      text: `${greeting(message.recipientName)},\n\nVerify your email: ${verificationUrl}`,
      html: `<p>${escapeHtml(greeting(message.recipientName))},</p><p><a href="${escapeHtml(verificationUrl)}">Verify your email</a></p>`,
    });
  }

  async sendPasswordReset(message: PasswordResetMail): Promise<void> {
    const resetUrl = safeHttpUrl(message.resetUrl, 'resetUrl');
    await this.send({
      to: message.to,
      subject: 'Reset your Muchakucha Zwei password',
      text: `${greeting(message.recipientName)},\n\nReset your password: ${resetUrl}`,
      html: `<p>${escapeHtml(greeting(message.recipientName))},</p><p><a href="${escapeHtml(resetUrl)}">Reset your password</a></p>`,
    });
  }

  async sendPasswordChangedNotice(message: PasswordChangedMail): Promise<void> {
    const changedAt = message.changedAt.toISOString();
    await this.send({
      to: message.to,
      subject: 'Your Muchakucha Zwei password was changed',
      text: `${greeting(message.recipientName)},\n\nYour password was changed at ${changedAt}. If this was not you, reset it immediately.`,
      html: `<p>${escapeHtml(greeting(message.recipientName))},</p><p>Your password was changed at ${escapeHtml(changedAt)}. If this was not you, reset it immediately.</p>`,
    });
  }

  private async send(message: SendMailOptions): Promise<void> {
    await this.transport.sendMail({
      ...message,
      from: this.config.from,
      to: assertSafeHeader(String(message.to), 'mail recipient'),
    });
  }
}
