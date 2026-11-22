import { createECDH } from 'node:crypto';
import { generateRequestDetails, type RequestOptions } from 'web-push';
import type { reminderPushMessage } from './expo-reminder-push.js';
import { isBase64UrlKey, isWebPushEndpoint } from './web-push-subscription.js';

function validVapidDetails(subject: string, publicKey: string, privateKey: string): boolean {
  const contact = URL.parse(subject);
  if (contact === null || /\s/.test(subject)) return false;
  if (contact.protocol === 'mailto:') {
    if (!/^[^@]+@[^@]+$/.test(contact.pathname)) return false;
  } else if (contact.protocol !== 'https:' || contact.username || contact.password) {
    return false;
  }
  if (!isBase64UrlKey(publicKey, 65) || !isBase64UrlKey(privateKey, 32)) return false;
  try {
    const key = createECDH('prime256v1');
    key.setPrivateKey(Buffer.from(privateKey, 'base64url'));
    return key.getPublicKey().toString('base64url') === publicKey;
  } catch {
    return false;
  }
}

export class WebReminderPush {
  private constructor(private readonly vapidDetails: NonNullable<RequestOptions['vapidDetails']>) {}

  static fromEnvironment(environment: NodeJS.ProcessEnv): WebReminderPush | undefined {
    const {
      REMINDER_WEB_PUSH_SUBJECT: subject,
      REMINDER_WEB_PUSH_PUBLIC_KEY: publicKey,
      REMINDER_WEB_PUSH_PRIVATE_KEY: privateKey,
    } = environment;
    if (subject === undefined && publicKey === undefined && privateKey === undefined) return undefined;
    if (!subject || !publicKey || !privateKey || !validVapidDetails(subject, publicKey, privateKey)) {
      throw new Error('REMINDER_WEB_PUSH_SUBJECT, REMINDER_WEB_PUSH_PUBLIC_KEY and REMINDER_WEB_PUSH_PRIVATE_KEY must specify a valid mailto: or https: contact and a matching VAPID key pair');
    }
    return new WebReminderPush({ subject, publicKey, privateKey });
  }

  async send(
    message: ReturnType<typeof reminderPushMessage>,
    expiresAt: number,
    { p256dh, auth }: { p256dh: string | null; auth: string | null },
  ): Promise<'accepted' | 'invalid' | 'retry' | 'failed'> {
    const ttl = Math.floor((expiresAt - Date.now()) / 1_000);
    if (ttl <= 0 || p256dh === null || auth === null || !isWebPushEndpoint(message.to)) return 'failed';
    const { title, body, data: { url } } = message;
    let request: ReturnType<typeof generateRequestDetails>;
    try {
      request = generateRequestDetails({ endpoint: message.to, keys: { p256dh, auth } }, JSON.stringify({ title, body, url }), {
        vapidDetails: this.vapidDetails,
        TTL: ttl,
        urgency: 'high',
        contentEncoding: 'aes128gcm',
      });
    } catch {
      // Encryption errors can contain subscription data.
      return 'failed';
    }
    if (request.body === null) return 'failed';
    const response = await fetch(request.endpoint, {
      method: request.method,
      headers: request.headers,
      body: new Uint8Array(request.body),
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    });
    await response.body?.cancel();
    if (response.ok) return 'accepted';
    if (response.status === 404 || response.status === 410) return 'invalid';
    if (response.status === 429 || response.status >= 500) return 'retry';
    return 'failed';
  }
}
