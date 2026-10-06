import { randomBytes } from 'node:crypto';
import { describe, expect, test, vi } from 'vitest';
import type { AssistantProvider as ProviderRow } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { AssistantCredentials } from './assistant-credentials.js';
import { AssistantSettingsService } from './assistant-settings.service.js';

const actor = { userId: 'member-1', householdId: 'household-1' };
const sealingKey = randomBytes(32).toString('base64');

function settingsWith(credentials: AssistantCredentials) {
  const row: ProviderRow = {
    id: 'provider-1', householdId: actor.householdId, ownerId: actor.userId, name: '家庭模型', protocol: 'openai-compatible',
    baseUrl: 'https://api.example.com/v1', model: 'family-model', visibility: 'private',
    encryptedApiKey: new AssistantCredentials(sealingKey).encrypt('sk-test', `${actor.householdId}:${actor.userId}:provider-1`),
    destinationUpdatedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
  };
  const prisma = {
    membership: { findUnique: vi.fn().mockResolvedValue({ id: 'membership-1' }) },
    assistantProvider: { findMany: vi.fn().mockResolvedValue([row]) },
    assistantUsage: { findMany: vi.fn().mockResolvedValue([]) },
  };
  return new AssistantSettingsService(prisma as unknown as PrismaService, credentials);
}

describe('assistant provider settings', () => {
  test('a credential is reported usable only when the current server key can open it', async () => {
    await expect(settingsWith(new AssistantCredentials(sealingKey)).list(actor)).resolves.toMatchObject({ providers: [{ hasCredential: true }] });
    await expect(settingsWith(new AssistantCredentials(randomBytes(32).toString('base64'))).list(actor)).resolves.toMatchObject({ providers: [{ hasCredential: false }] });
    await expect(settingsWith(new AssistantCredentials()).list(actor)).resolves.toMatchObject({ providers: [{ hasCredential: false }] });
  });
});
