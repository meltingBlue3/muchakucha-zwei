import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsIn, IsInt, IsString, IsUUID, Length, Min } from 'class-validator';

export class CreateAssistantProviderDto {
  @ApiProperty() @IsString() @Length(1, 80) name!: string;
  @ApiProperty({ enum: ['openai-compatible', 'anthropic'] }) @IsIn(['openai-compatible', 'anthropic']) protocol!: 'openai-compatible' | 'anthropic';
  @ApiProperty() @IsString() @Length(1, 500) baseUrl!: string;
  @ApiProperty() @IsString() @Length(1, 120) model!: string;
  @ApiProperty({ enum: ['private', 'household'] }) @IsIn(['private', 'household']) visibility!: 'private' | 'household';
  @ApiProperty({ writeOnly: true }) @IsString() @Length(1, 4096) apiKey!: string;
}

export class UpdateAssistantProviderDto extends PartialType(CreateAssistantProviderDto, { skipNullProperties: false }) {
  @ApiProperty() @IsDateString() expectedUpdatedAt!: string;
}

export class AssistantProviderResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['openai-compatible', 'anthropic'] }) protocol!: 'openai-compatible' | 'anthropic';
  @ApiProperty() baseUrl!: string;
  @ApiProperty() model!: string;
  @ApiProperty({ enum: ['private', 'household'] }) visibility!: 'private' | 'household';
  @ApiProperty() ownedByMe!: boolean;
  @ApiProperty() hasCredential!: boolean;
  @ApiProperty() updatedAt!: string;
}

export class AssistantProviderListResponseDto {
  @ApiProperty({ type: [AssistantProviderResponseDto] }) providers!: AssistantProviderResponseDto[];
}

export class CreateAssistantConversationDto {
  @ApiProperty() @IsUUID('4') providerId!: string;
}

export class SendAssistantMessageDto {
  @ApiProperty() @IsString() @Length(1, 8000) message!: string;
  @ApiProperty() @IsString() @Length(1, 80) timeZone!: string;
  @ApiProperty() @IsInt() @Min(0) expectedVersion!: number;
}

export class DecideAssistantActionDto {
  @ApiProperty() @IsBoolean() approve!: boolean;
  @ApiProperty() @IsInt() @Min(0) expectedVersion!: number;
}

export class AssistantVisibleMessageDto {
  @ApiProperty({ enum: ['user', 'assistant', 'tool'] }) role!: 'user' | 'assistant' | 'tool';
  @ApiProperty() content!: string;
}

export class AssistantPendingActionDto {
  @ApiProperty() name!: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) arguments!: Record<string, unknown>;
}

export class AssistantConversationSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() updatedAt!: string;
}

export class AssistantConversationListResponseDto {
  @ApiProperty({ type: [AssistantConversationSummaryDto] }) conversations!: AssistantConversationSummaryDto[];
}

export class AssistantConversationResponseDto extends AssistantConversationSummaryDto {
  @ApiProperty({ type: String, nullable: true }) providerId!: string | null;
  @ApiProperty() version!: number;
  @ApiProperty({ enum: ['idle', 'running'] }) state!: 'idle' | 'running';
  @ApiProperty({ type: [AssistantVisibleMessageDto] }) messages!: AssistantVisibleMessageDto[];
  @ApiProperty({ type: AssistantPendingActionDto, nullable: true }) pendingAction!: AssistantPendingActionDto | null;
}

export class AssistantHouseholdParam {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4') householdId!: string;
}

export class AssistantProviderParam extends AssistantHouseholdParam {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4') providerId!: string;
}

export class AssistantConversationParam extends AssistantHouseholdParam {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4') conversationId!: string;
}
