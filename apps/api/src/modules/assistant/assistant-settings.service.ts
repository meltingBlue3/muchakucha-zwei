import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { AssistantProvider as ProviderRow } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { AssistantCredentials } from './assistant-credentials.js';
import { validateAssistantBaseUrl } from './assistant-provider.js';
import type { AssistantActor, AssistantCompletion, AssistantProviderConfig } from './assistant.types.js';
import type {
  AssistantProviderResponseDto, AssistantProviderUsageDto, CheckAssistantProviderDto, CreateAssistantProviderDto, UpdateAssistantProviderDto,
} from './dto/assistant.dto.js';

function utcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

@Injectable()
export class AssistantSettingsService {
  private readonly logger = new Logger(AssistantSettingsService.name);

  constructor(private readonly prisma: PrismaService, private readonly credentials: AssistantCredentials) {}

  async requireMember(actor: AssistantActor): Promise<void> {
    const membership = await this.prisma.membership.findUnique({ where: { userId_householdId: { userId: actor.userId, householdId: actor.householdId } }, select: { id: true } });
    if (!membership) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found.' });
  }

  private availableWhere(actor: AssistantActor) {
    return { householdId: actor.householdId, OR: [{ ownerId: actor.userId }, { visibility: 'household' }] };
  }

  async requireProvider(actor: AssistantActor, id: string): Promise<ProviderRow> {
    await this.requireMember(actor);
    const provider = await this.prisma.assistantProvider.findFirst({ where: { id, ...this.availableWhere(actor) } });
    if (!provider) throw new NotFoundException({ code: 'ASSISTANT_PROVIDER_NOT_FOUND', message: 'Model configuration not found.' });
    return provider;
  }

  /** A credential sealed under a replaced server key, or with no key configured, cannot be used. */
  private usable(row: ProviderRow): boolean {
    try {
      this.credentials.decrypt(row.encryptedApiKey, `${row.householdId}:${row.ownerId}:${row.id}`);
      return true;
    } catch {
      return false;
    }
  }

  private response(row: ProviderRow, userId: string, usage: AssistantProviderUsageDto | null = null): AssistantProviderResponseDto {
    return { id: row.id, name: row.name, protocol: row.protocol as AssistantProviderConfig['protocol'], baseUrl: row.baseUrl, model: row.model,
      visibility: row.visibility as 'private' | 'household', ownedByMe: row.ownerId === userId, hasCredential: this.usable(row), updatedAt: row.updatedAt.toISOString(), usage };
  }

  async list(actor: AssistantActor) {
    await this.requireMember(actor);
    const providers = await this.prisma.assistantProvider.findMany({ where: this.availableWhere(actor), orderBy: { createdAt: 'asc' } });
    const usage = await this.monthUsage(providers.filter(row => row.ownerId === actor.userId).map(row => row.id));
    return { providers: providers.map(row => this.response(row, actor.userId, row.ownerId === actor.userId ? usage(row.id) : null)) };
  }

  /** This UTC month's usage of the given configurations, by member. Only their owner is shown it: the owner pays. */
  private async monthUsage(providerIds: string[], now = new Date()): Promise<(providerId: string) => AssistantProviderUsageDto> {
    const month = utcMonth(now);
    const rows = providerIds.length ? await this.prisma.assistantUsage.findMany({
      where: { providerId: { in: providerIds }, month }, include: { user: { select: { displayName: true } } }, orderBy: { requests: 'desc' },
    }) : [];
    return providerId => {
      const members = rows.filter(row => row.providerId === providerId).map(row => ({
        userId: row.userId, displayName: row.user.displayName, requests: row.requests, inputTokens: Number(row.inputTokens), outputTokens: Number(row.outputTokens),
      }));
      return {
        month: month.toISOString().slice(0, 7), members,
        requests: members.reduce((sum, member) => sum + member.requests, 0),
        inputTokens: members.reduce((sum, member) => sum + member.inputTokens, 0),
        outputTokens: members.reduce((sum, member) => sum + member.outputTokens, 0),
      };
    };
  }

  /** Counts one model request against its configuration. A failure here never fails the conversation. */
  async recordUsage(providerId: string, userId: string, usage: AssistantCompletion['usage'], now = new Date()): Promise<void> {
    const month = utcMonth(now);
    const inputTokens = BigInt(usage?.inputTokens ?? 0);
    const outputTokens = BigInt(usage?.outputTokens ?? 0);
    try {
      await this.prisma.assistantUsage.upsert({
        where: { providerId_userId_month: { providerId, userId, month } },
        create: { providerId, userId, month, requests: 1, inputTokens, outputTokens },
        update: { requests: { increment: 1 }, inputTokens: { increment: inputTokens }, outputTokens: { increment: outputTokens } },
      });
    } catch (error) {
      this.logger.warn(`usage not recorded: provider ${providerId} (${error instanceof Error ? error.name : typeof error})`);
    }
  }

  private nonblank(value: string): string {
    if (!value.trim()) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'A nonempty value is required.' });
    return value.trim();
  }

  async create(actor: AssistantActor, input: CreateAssistantProviderDto) {
    await this.requireMember(actor);
    if (await this.prisma.assistantProvider.count({ where: { householdId: actor.householdId, ownerId: actor.userId } }) >= 20) {
      throw new BadRequestException({ code: 'ASSISTANT_PROVIDER_LIMIT_REACHED', message: 'Remove an unused model configuration first.' });
    }
    const id = randomUUID();
    const row = await this.prisma.assistantProvider.create({ data: {
      id, householdId: actor.householdId, ownerId: actor.userId, name: this.nonblank(input.name), protocol: input.protocol,
      baseUrl: validateAssistantBaseUrl(input.baseUrl).toString().replace(/\/$/, ''), model: this.nonblank(input.model), visibility: input.visibility,
      encryptedApiKey: this.credentials.encrypt(this.nonblank(input.apiKey), `${actor.householdId}:${actor.userId}:${id}`),
    } });
    return this.response(row, actor.userId);
  }

  async update(actor: AssistantActor, id: string, input: UpdateAssistantProviderDto) {
    const row = await this.requireProvider(actor, id);
    if (row.ownerId !== actor.userId) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only the configuration owner can edit it.' });
    const baseUrl = input.baseUrl === undefined ? undefined : validateAssistantBaseUrl(input.baseUrl).toString().replace(/\/$/, '');
    // Only a new destination ends existing conversations: their history must not follow it to another service.
    const moved = (input.protocol !== undefined && input.protocol !== row.protocol) || (baseUrl !== undefined && baseUrl !== row.baseUrl);
    const data = {
      ...(input.name === undefined ? {} : { name: this.nonblank(input.name) }),
      ...(input.protocol === undefined ? {} : { protocol: input.protocol }),
      ...(baseUrl === undefined ? {} : { baseUrl }),
      ...(input.model === undefined ? {} : { model: this.nonblank(input.model) }),
      ...(input.visibility === undefined ? {} : { visibility: input.visibility }),
      ...(input.apiKey === undefined ? {} : { encryptedApiKey: this.credentials.encrypt(this.nonblank(input.apiKey), `${actor.householdId}:${actor.userId}:${id}`) }),
      ...(moved ? { destinationUpdatedAt: new Date(Math.max(Date.now(), row.destinationUpdatedAt.getTime() + 1)) } : {}),
      updatedAt: new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1)),
    };
    const changed = await this.prisma.assistantProvider.updateMany({ where: { id, ownerId: actor.userId, householdId: actor.householdId, updatedAt: new Date(input.expectedUpdatedAt) }, data });
    if (changed.count !== 1) throw new ConflictException({ code: 'EDIT_CONFLICT', message: 'Reload the model configuration before editing.' });
    return this.response({ ...row, ...data }, actor.userId);
  }

  async delete(actor: AssistantActor, id: string): Promise<void> {
    const row = await this.requireProvider(actor, id);
    if (row.ownerId !== actor.userId) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only the configuration owner can delete it.' });
    await this.prisma.assistantProvider.deleteMany({ where: { id, ownerId: actor.userId, householdId: actor.householdId } });
  }

  /** Builds a configuration to check without saving it. A saved key is reused only for its owner. */
  async checkable(actor: AssistantActor, input: CheckAssistantProviderDto): Promise<AssistantProviderConfig> {
    await this.requireMember(actor);
    const baseUrl = validateAssistantBaseUrl(input.baseUrl).toString().replace(/\/$/, '');
    const model = this.nonblank(input.model);
    if (input.apiKey !== undefined) return { protocol: input.protocol, baseUrl, model, apiKey: this.nonblank(input.apiKey) };
    if (input.providerId === undefined) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'An API key is required.', details: [{ field: 'apiKey', codes: ['isDefined'] }] });
    const row = await this.requireProvider(actor, input.providerId);
    if (row.ownerId !== actor.userId) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only the configuration owner can use its saved key.' });
    return { protocol: input.protocol, baseUrl, model, apiKey: this.credentials.decrypt(row.encryptedApiKey, `${row.householdId}:${row.ownerId}:${row.id}`) };
  }

  /** `expectedDestination` is the destination version a conversation was started with. */
  async resolve(actor: AssistantActor, id: string, expectedDestination?: Date): Promise<AssistantProviderConfig> {
    const row = await this.requireProvider(actor, id);
    if (expectedDestination && row.destinationUpdatedAt.getTime() !== expectedDestination.getTime()) {
      throw new ConflictException({ code: 'ASSISTANT_PROVIDER_CHANGED', message: 'The model configuration changed. Start a new conversation after reviewing the destination.' });
    }
    return { protocol: row.protocol as AssistantProviderConfig['protocol'], baseUrl: row.baseUrl, model: row.model,
      apiKey: this.credentials.decrypt(row.encryptedApiKey, `${row.householdId}:${row.ownerId}:${row.id}`) };
  }
}
