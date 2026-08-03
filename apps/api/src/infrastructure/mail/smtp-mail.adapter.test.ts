import type { SendMailOptions, Transporter } from 'nodemailer';
import { describe, expect, test } from 'vitest';
import { MAIL_PORT, type MailPort } from './mail.port.js';
import { loadSmtpMailConfig, SmtpMailAdapter } from './smtp-mail.adapter.js';

function captureAdapter(): { adapter: MailPort; sent: SendMailOptions[] } {
  const sent: SendMailOptions[] = [];
  const transport: Pick<Transporter, 'sendMail'> = {
    sendMail: async (message: SendMailOptions) => {
      sent.push(message);
      return { accepted: [message.to] };
    },
  } as Pick<Transporter, 'sendMail'>;

  return {
    adapter: new SmtpMailAdapter(loadSmtpMailConfig({ NODE_ENV: 'test' }), transport),
    sent,
  };
}

describe('provider-neutral SMTP mail adapter', () => {
  test('defines a stable injection token and local Mailpit defaults', () => {
    expect(MAIL_PORT).toBeTypeOf('symbol');
    expect(loadSmtpMailConfig({ NODE_ENV: 'test' })).toEqual({
      from: 'no-reply@muchakucha.test',
      host: '127.0.0.1',
      port: 11025,
      secure: false,
    });
  });

  test('fails fast when production SMTP credentials are incomplete', () => {
    expect(() => loadSmtpMailConfig({ NODE_ENV: 'production' })).toThrow('SMTP_HOST is required');
  });

  test('composes verification, reset, and password-changed messages only at the transport boundary', async () => {
    const { adapter, sent } = captureAdapter();
    await adapter.sendEmailVerification({
      to: 'member@example.test',
      recipientName: '<Member>',
      verificationUrl: 'http://127.0.0.1:8081/verify-email?token=verification-secret',
    });
    await adapter.sendPasswordReset({
      to: 'member@example.test',
      resetUrl: 'http://127.0.0.1:8081/reset-password?token=reset-secret',
    });
    await adapter.sendPasswordChangedNotice({
      to: 'member@example.test',
      changedAt: new Date('2026-08-01T00:00:00.000Z'),
    });

    expect(sent).toHaveLength(3);
    expect(sent[0]?.text).toContain('verification-secret');
    expect(sent[0]?.html).toContain('&lt;Member&gt;');
    expect(sent[1]?.text).toContain('reset-secret');
    expect(JSON.stringify(sent[2])).not.toMatch(/verification-secret|reset-secret/);
  });

  test('maps invitation recipient, URL, inviter, household, and expiry in text and escaped HTML', async () => {
    const { adapter, sent } = captureAdapter();
    await adapter.sendHouseholdInvitation({
      to: 'friend@example.test',
      recipientName: '我的朋友',
      invitationUrl: 'http://127.0.0.1:8081/invite/test?token=invite-token-secret',
      inviterDisplayName: '家主',
      householdDisplayName: '温暖小家',
      expiresAt: new Date('2026-08-10T00:00:00.000Z'),
    });

    expect(sent).toHaveLength(1);
    const message = sent[0]!;

    // Recipient mapping
    expect(message.to).toBe('friend@example.test');

    // Subject contains inviter and household
    expect(message.subject).toContain('家主');
    expect(message.subject).toContain('温暖小家');

    // Plain text: inviter display, household display, raw invitation URL, expiry
    expect(message.text).toContain('我的朋友');
    expect(message.text).toContain('家主');
    expect(message.text).toContain('温暖小家');
    expect(message.text).toContain('invite-token-secret');
    expect(message.text).toContain('http://127.0.0.1:8081/invite/test?token=invite-token-secret');
    expect(message.text).toContain('2026-08-10T00:00:00.000Z');

    // HTML: escaped inviter display, escaped household display, escaped invitation URL, escaped expiry
    expect(message.html).toContain('我的朋友');
    expect(message.html).toContain('家主');
    expect(message.html).toContain('温暖小家');
    expect(message.html).toContain('invite-token-secret');
    expect(message.html).toContain('http://127.0.0.1:8081/invite/test?token=invite-token-secret');
    expect(message.html).toContain('2026-08-10T00:00:00.000Z');

    // Token is not leaked across messages
    expect(JSON.stringify(sent)).not.toMatch(/invite-token-secret/);
  });
});
