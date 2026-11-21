import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { reminderPushMessage } from './expo-reminder-push.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

type AccessToken = { value: string; expiresAt: number };

export class FcmReminderPush {
  private token: AccessToken | undefined;
  private exchange: Promise<AccessToken> | undefined;

  private constructor(
    private readonly projectId: string,
    private readonly clientEmail: string,
    private readonly privateKey: KeyObject,
  ) {}

  static fromFile(path: string): FcmReminderPush {
    try {
      const key: unknown = JSON.parse(readFileSync(path, 'utf8'));
      if (typeof key === 'object' && key !== null && 'type' in key && key.type === 'service_account'
        && 'project_id' in key && typeof key.project_id === 'string' && /^[a-z0-9-]+$/.test(key.project_id)
        && 'client_email' in key && typeof key.client_email === 'string'
        && 'private_key' in key && typeof key.private_key === 'string') {
        const privateKey = createPrivateKey(key.private_key);
        if (privateKey.asymmetricKeyType === 'rsa') return new FcmReminderPush(key.project_id, key.client_email, privateKey);
      }
    } catch { /* A parsing error can include credential content. */ }
    throw new Error('REMINDER_FCM_CREDENTIALS_FILE must point to a valid Firebase service account key');
  }

  private async fetchAccessToken(): Promise<AccessToken> {
    const timestamp = Math.floor(Date.now() / 1_000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claims = Buffer.from(JSON.stringify({
      iss: this.clientEmail, scope: SCOPE, aud: TOKEN_URL, iat: timestamp, exp: timestamp + 3_600,
    })).toString('base64url');
    const unsigned = `${header}.${claims}`;
    const signature = sign('RSA-SHA256', Buffer.from(unsigned), this.privateKey).toString('base64url');
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Firebase access token request failed');
    }
    const data = await response.json() as { access_token?: unknown; expires_in?: unknown };
    if (typeof data.access_token !== 'string' || typeof data.expires_in !== 'number') throw new Error('Firebase access token response was invalid');
    return { value: data.access_token, expiresAt: timestamp * 1_000 + data.expires_in * 1_000 };
  }

  private getAccessToken(): Promise<AccessToken> {
    if (this.token !== undefined && this.token.expiresAt > Date.now() + 60_000) return Promise.resolve(this.token);
    return this.exchange ??= this.fetchAccessToken().then(token => (this.token = token))
      .finally(() => { this.exchange = undefined; });
  }

  async send(message: ReturnType<typeof reminderPushMessage>, expiresAt: number): Promise<'accepted' | 'invalid' | 'retry' | 'failed'> {
    // Authentication happens before delivery, so an OAuth error is safe to retry.
    const token = await this.getAccessToken().catch(() => undefined);
    if (token === undefined) return 'retry';
    const ttl = Math.floor((expiresAt - Date.now()) / 1_000);
    if (ttl <= 0) return 'failed';
    const { title, body } = message;
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.value}` },
      body: JSON.stringify({ message: {
        token: message.to,
        notification: { title, body },
        // Expo Notifications decodes custom Android notification data from this field.
        data: { body: JSON.stringify(message.data) },
        android: {
          priority: 'HIGH',
          ttl: `${ttl}s`,
          notification: { title, body, channel_id: message.channelId, default_sound: true, proxy: 'ALLOW' },
        },
      } }),
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    });
    if (response.status === 404) {
      const data = await response.json().catch(() => undefined) as { error?: { details?: { errorCode?: string }[] } } | undefined;
      return data?.error?.details?.some(detail => detail.errorCode === 'UNREGISTERED') ? 'invalid' : 'failed';
    }
    await response.body?.cancel();
    if (response.ok) return 'accepted';
    if (response.status === 401 && this.token === token) this.token = undefined;
    return response.status === 401 || response.status === 429 || response.status === 503 ? 'retry' : 'failed';
  }
}
