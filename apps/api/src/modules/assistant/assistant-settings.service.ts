import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AssistantProvider as ProviderRow } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { AssistantCredentials } from './assistant-credentials.js';
import { validateAssistantBaseUrl } from './assistant-provider.js';
import type { AssistantActor, AssistantProviderConfig } from './assistant.types.js';
import type { AssistantProviderResponseDto, CreateAssistantProviderDto, UpdateAssistantProviderDto } from './dto/assistant.dto.js';

@Injectable()
export class AssistantSettingsService {
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

  private response(row: ProviderRow, userId: string): AssistantProviderResponseDto {
    return { id: row.id, name: row.name, protocol: row.protocol as AssistantProviderConfig['protocol'], baseUrl: row.baseUrl, model: row.model,
      visibility: row.visibility as 'private' | 'household', ownedByMe: row.ownerId === userId, hasCredential: true, updatedAt: row.updatedAt.toISOString() };
  }

  async list(actor: AssistantActor) {
    await this.requireMember(actor);
    const providers = await this.prisma.assistantProvider.findMany({ where: this.availableWhere(actor), orderBy: { createdAt: 'asc' } });
    return { providers: providers.map(row => this.response(row, actor.userId)) };
  }

  private nonblank(value: string): string {
    if (!value.trim()) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'A nonempty value is required.' });
    return value.trim();
  }

  async create(actor: AssistantActor, input: CreateAssistantProviderDto) {
    await this.requireMember(actor);
    if (await this.prisma.assistantProvider.count({ where: { householdId: actor.householdId, ownerId: actor.userId } }) >= 20) {
      throw new BadRequestException({ code: 'ASSISTANT_LIMIT_REACHED', message: 'Remove an unused model configuration first.' });
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
    const data = {
      ...(input.name === undefined ? {} : { name: this.nonblank(input.name) }),
      ...(input.protocol === undefined ? {} : { protocol: input.protocol }),
      ...(input.baseUrl === undefined ? {} : { baseUrl: validateAssistantBaseUrl(input.baseUrl).toString().replace(/\/$/, '') }),
      ...(input.model === undefined ? {} : { model: this.nonblank(input.model) }),
      ...(input.visibility === undefined ? {} : { visibility: input.visibility }),
      ...(input.apiKey === undefined ? {} : { encryptedApiKey: this.credentials.encrypt(this.nonblank(input.apiKey), `${actor.householdId}:${actor.userId}:${id}`) }),
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

  async resolve(actor: AssistantActor, id: string, expectedVersion?: Date): Promise<AssistantProviderConfig> {
    const row = await this.requireProvider(actor, id);
    if (expectedVersion && row.updatedAt.getTime() !== expectedVersion.getTime()) {
      throw new ConflictException({ code: 'ASSISTANT_PROVIDER_CHANGED', message: 'The model configuration changed. Start a new conversation after reviewing the destination.' });
    }
    return { protocol: row.protocol as AssistantProviderConfig['protocol'], baseUrl: row.baseUrl, model: row.model,
      apiKey: this.credentials.decrypt(row.encryptedApiKey, `${row.householdId}:${row.ownerId}:${row.id}`) };
  }
}
