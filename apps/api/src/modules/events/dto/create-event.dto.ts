import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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

  @ApiProperty()
  createdBy!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class EventListResponseDto {
  @ApiProperty({ type: [EventResponseDto] })
  events!: EventResponseDto[];

  @ApiProperty()
  total!: number;
}
