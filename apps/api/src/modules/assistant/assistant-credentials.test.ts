import { describe, expect, test } from 'vitest';
import { AssistantCredentials } from './assistant-credentials.js';

describe('assistant credential encryption', () => {
  const context = 'household:user:provider';
  const credentials = new AssistantCredentials(Buffer.alloc(32, 1).toString('base64'));

  test('uses fresh authenticated encryption and restores the original credential', () => {
    const first = credentials.encrypt('test-api-key', context);
    expect(first).not.toContain('test-api-key');
    expect(credentials.encrypt('test-api-key', context)).not.toBe(first);
    expect(credentials.decrypt(first, context)).toBe('test-api-key');
  });

  test('cannot transplant a credential to another configuration or decrypt with a different key', () => {
    const encrypted = credentials.encrypt('test-api-key', context);
    expect(() => credentials.decrypt(encrypted, 'another-household:user:provider')).toThrow();
    expect(() => new AssistantCredentials(Buffer.alloc(32, 2).toString('base64')).decrypt(encrypted, context)).toThrow();
  });

  test('rejects modified ciphertext and fails closed without an encryption key', () => {
    const encrypted = credentials.encrypt('test-api-key', context);
    const parts = encrypted.split('.');
    const ciphertext = Buffer.from(parts[3]!, 'base64');
    ciphertext[0] = ciphertext[0]! ^ 1;
    parts[3] = ciphertext.toString('base64');
    expect(() => credentials.decrypt(parts.join('.'), context)).toThrow();
    expect(() => new AssistantCredentials().encrypt('test-api-key', context)).toThrow();
    expect(() => new AssistantCredentials('invalid-short-key')).toThrow();
  });
});
