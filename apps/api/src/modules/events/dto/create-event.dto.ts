import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { LabelResponseDto } from '../../labels/dto/create-label.dto.js';
import { RecurrenceDto, RecurrenceResponseDto } from '../../recurrence/dto/recurrence.dto.js';

export class CreateEventDto {
  @ApiProperty({ description: 'Event title', minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: 'Optional description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Start time in ISO 8601 format' })
  @IsDateString()
  startTime!: string;

  @ApiProperty({ description: 'End time in ISO 8601 format' })
  @IsDateString()
  endTime!: string;

  @ApiPropertyOptional({ description: 'Whether this is an all-day event', default: false })
  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @ApiPropertyOptional({ description: 'Optional location', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @ApiPropertyOptional({ description: '重复规则；省略即普通一次性事件', type: () => RecurrenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RecurrenceDto)
  recurrence?: RecurrenceDto;
}

export class EventResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  householdId!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional()
  description?: string | null;

  @ApiProperty()
  startTime!: string;

  @ApiProperty()
  endTime!: string;

  @ApiProperty()
  allDay!: boolean;

  @ApiPropertyOptional()
  location?: string | null;

  @ApiProperty({ nullable: true })
  recurrenceRuleId!: string | null;

  @ApiProperty({ nullable: true })
  occurrenceDate!: string | null;

  @ApiProperty({ nullable: true })
  cancelledAt!: string | null;

  @ApiProperty({ type: () => RecurrenceResponseDto, nullable: true })
  recurrence!: RecurrenceResponseDto | null;

  @ApiProperty()
  createdBy!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  @ApiProperty({ type: [LabelResponseDto] })
  labels!: LabelResponseDto[];
}

export class EventListResponseDto {
  @ApiProperty({ type: [EventResponseDto] })
  events!: EventResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty({ nullable: true })
  materializedThrough!: string | null;
}
