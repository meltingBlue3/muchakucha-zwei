import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  IsUUID,
  Length,
  ValidateNested,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

export const RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export const RECURRENCE_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export const RECURRENCE_MAX_COUNT = 1000;
export const RECURRENCE_MAX_INTERVAL = 52;
export const SERIES_SCOPES = ['this_only', 'this_and_following'] as const;
export type SeriesScope = (typeof SERIES_SCOPES)[number];

export function IsIanaTimeZone(validationOptions?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'isIanaTimeZone',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      ...(validationOptions === undefined ? {} : { options: validationOptions }),
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          try {
            new Intl.DateTimeFormat('en', { timeZone: value });
            return true;
          } catch {
            return false;
          }
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a valid IANA time zone`;
        },
      },
    });
  };
}

export class RecurrenceDto {
  @ApiProperty({ enum: RECURRENCE_FREQUENCIES })
  @IsString()
  @IsIn(RECURRENCE_FREQUENCIES)
  freq!: (typeof RECURRENCE_FREQUENCIES)[number];

  @ApiPropertyOptional({ minimum: 1, maximum: RECURRENCE_MAX_INTERVAL, default: 1 })
  @IsOptional() @IsInt() @Min(1) @Max(RECURRENCE_MAX_INTERVAL)
  interval?: number;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional() @IsArray() @ArrayMaxSize(7) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true })
  byWeekday?: number[];

  @ApiProperty({ example: '2026-08-13' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startsOn!: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endsOn?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: RECURRENCE_MAX_COUNT })
  @IsOptional() @IsInt() @Min(1) @Max(RECURRENCE_MAX_COUNT)
  count?: number;

  @ApiProperty({ example: 'Asia/Shanghai' })
  @IsString() @MaxLength(64) @IsIanaTimeZone()
  timezone!: string;

  @ApiPropertyOptional({ example: '08:30' })
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTimeLocal?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1440 })
  @IsOptional() @IsInt() @Min(0) @Max(1440)
  durationMinutes?: number;
}

export class RecurrenceResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: RECURRENCE_FREQUENCIES }) freq!: string;
  @ApiProperty() interval!: number;
  @ApiProperty({ type: [Number] }) byWeekday!: number[];
  @ApiProperty() startsOn!: string;
  @ApiProperty({ nullable: true }) endsOn!: string | null;
  @ApiProperty({ nullable: true }) count!: number | null;
  @ApiProperty() timezone!: string;
  @ApiProperty({ nullable: true }) materializedThrough!: string | null;
  @ApiProperty({ nullable: true }) startTimeLocal!: string | null;
  @ApiProperty({ nullable: true }) durationMinutes!: number | null;
}

export class UpdateSeriesDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @IsOptional() @IsString() @Length(1, 200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional() @IsString() @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ enum: ['pending', 'in_progress', 'completed', 'cancelled'] })
  @IsOptional() @IsString() @IsIn(['pending', 'in_progress', 'completed', 'cancelled'])
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';

  @ApiPropertyOptional({ enum: ['low', 'medium', 'high', 'urgent'] })
  @IsOptional() @IsString() @IsIn(['low', 'medium', 'high', 'urgent'])
  priority?: 'low' | 'medium' | 'high' | 'urgent';

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsUUID('4', { each: true })
  assigneeIds?: string[];

  /** Replaces the labels carried over from the pre-edit occurrence. */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsUUID('4', { each: true })
  labelIds?: string[];

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  startTime?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  endTime?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  allDay?: boolean;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional() @IsString() @MaxLength(255)
  location?: string;

  @ApiPropertyOptional({ type: () => RecurrenceDto })
  @IsOptional() @ValidateNested() @Type(() => RecurrenceDto)
  recurrence?: RecurrenceDto;
}

export class DeleteSeriesQueryDto {
  @ApiProperty({ enum: SERIES_SCOPES })
  @IsString() @IsIn(SERIES_SCOPES)
  scope!: SeriesScope;
}

export class SeriesMutationResponseDto {
  @ApiProperty()
  recurrenceRuleId!: string;
}
