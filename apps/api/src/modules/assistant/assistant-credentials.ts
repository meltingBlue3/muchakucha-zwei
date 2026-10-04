import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';

/** The server key is independent of authentication keys and never stored in the database. */
export class AssistantCredentials {
  private readonly key: Buffer | null;

  constructor(encodedKey?: string) {
    const decoded = encodedKey ? Buffer.from(encodedKey, 'base64') : null;
    if (encodedKey && (decoded?.length !== 32 || decoded.toString('base64') !== encodedKey)) {
      throw new Error('ASSISTANT_ENCRYPTION_KEY must be a canonical base64 encoded 32-byte key.');
    }
    this.key = decoded;
  }

  private requireKey(): Buffer {
    if (!this.key) throw new ServiceUnavailableException({ code: 'ASSISTANT_NOT_CONFIGURED', message: 'Assistant credential encryption is not configured.' });
    return this.key;
  }

  encrypt(secret: string, context: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.requireKey(), iv);
    cipher.setAAD(Buffer.from(context));
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join('.');
  }

  decrypt(encrypted: string, context: string): string {
    const key = this.requireKey();
    try {
      const [version, iv, tag, ciphertext, extra] = encrypted.split('.');
      if (version !== 'v1' || !iv || !tag || !ciphertext || extra !== undefined) throw new Error('Invalid ciphertext');
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
    } catch {
      throw new ServiceUnavailableException({ code: 'ASSISTANT_CREDENTIAL_UNAVAILABLE', message: 'Reconfigure the model credential.' });
    }
  }
}
