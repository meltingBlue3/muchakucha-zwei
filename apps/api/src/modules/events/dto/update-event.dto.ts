import { IsDateString as IsEditDate, IsArray as IsEditArray, IsUUID as IsEditUuid } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { RecurrenceDto } from '../../recurrence/dto/recurrence.dto.js';

export class UpdateEventDto {
  @ApiProperty({ description: 'Required version read before editing; stale writes return 409 EDIT_CONFLICT.' })
  @IsEditDate()
  expectedUpdatedAt!: string;

  @ApiPropertyOptional({ description: 'Required when editing a recurring occurrence.' })
  @IsOptional() @IsEditDate()
  expectedRuleUpdatedAt?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsEditArray() @IsEditUuid('4', { each: true })
  labelIds?: string[];

  @ApiPropertyOptional({ description: 'Event title', minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Optional description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Start time in ISO 8601 format' })
  @IsOptional()
  @IsDateString()
  startTime?: string;

  @ApiPropertyOptional({ description: 'End time in ISO 8601 format' })
  @IsOptional()
  @IsDateString()
  endTime?: string;

  @ApiPropertyOptional({ description: 'Whether this is an all-day event' })
  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @ApiPropertyOptional({ description: 'Optional location', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @ApiPropertyOptional({ description: '重复规则：给一次性的条目加上，它就成为新系列的第一次；已属于系列的条目忽略此项，改系列走 /series。省略即不改变。', type: () => RecurrenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RecurrenceDto)
  recurrence?: RecurrenceDto;
}
