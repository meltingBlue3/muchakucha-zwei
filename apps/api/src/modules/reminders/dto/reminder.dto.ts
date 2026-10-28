import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsUUID, Matches, Max, Min, ValidateIf } from 'class-validator';

/** Seven days: the furthest a reminder can come before its due or start time. */
export const REMINDER_MAX_MINUTES = 10_080;

export const REMINDER_MODES = ['default', 'off', 'before'] as const;
export type ReminderMode = (typeof REMINDER_MODES)[number];

/**
 * The caller's own reminder for one task or event. `default` follows their
 * settings, `off` silences it, `before` fires `minutesBefore` ahead. `alarm`
 * chooses separately whether it rings, null following the settings. On a
 * recurring occurrence it applies to the whole series.
 */
export class ReminderChoiceDto {
  @ApiProperty({ enum: REMINDER_MODES })
  @IsIn(REMINDER_MODES)
  mode!: ReminderMode;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0, maximum: REMINDER_MAX_MINUTES, description: 'Required with mode "before"; null otherwise.' })
  @ValidateIf((choice: ReminderChoiceDto) => choice.mode === 'before')
  @IsInt()
  @Min(0)
  @Max(REMINDER_MAX_MINUTES)
  minutesBefore?: number | null;

  @ApiPropertyOptional({ type: Boolean, nullable: true, description: 'Ring like an alarm clock until dismissed; null or omitted follows the settings. Always null with mode "off".' })
  @ValidateIf((choice: ReminderChoiceDto) => choice.alarm !== undefined && choice.alarm !== null)
  @IsBoolean()
  alarm?: boolean | null;
}

export class ReminderSettingsHouseholdDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() muted!: boolean;
}

export class ReminderSettingsDto {
  @ApiProperty({ type: Number, nullable: true, description: 'Minutes before a task is due; null means no task reminders.' })
  taskMinutesBefore!: number | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Minutes before an event starts; null means no event reminders.' })
  eventMinutesBefore!: number | null;

  @ApiProperty({ description: 'Local HH:MM used for date-only tasks and all-day events.' })
  dateOnlyTime!: string;

  @ApiProperty({ description: 'Reminders ring like an alarm clock until dismissed, on phones that can.' })
  alarm!: boolean;

  @ApiProperty({ type: [ReminderSettingsHouseholdDto] })
  households!: ReminderSettingsHouseholdDto[];
}

/** Replaces all settings at once, so null can mean "off" rather than "unchanged". */
export class UpdateReminderSettingsDto {
  @ApiProperty({ type: Number, nullable: true, minimum: 0, maximum: REMINDER_MAX_MINUTES })
  @ValidateIf((settings: UpdateReminderSettingsDto) => settings.taskMinutesBefore !== null)
  @IsInt()
  @Min(0)
  @Max(REMINDER_MAX_MINUTES)
  taskMinutesBefore!: number | null;

  @ApiProperty({ type: Number, nullable: true, minimum: 0, maximum: REMINDER_MAX_MINUTES })
  @ValidateIf((settings: UpdateReminderSettingsDto) => settings.eventMinutesBefore !== null)
  @IsInt()
  @Min(0)
  @Max(REMINDER_MAX_MINUTES)
  eventMinutesBefore!: number | null;

  @ApiProperty({ example: '09:00' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  dateOnlyTime!: string;

  @ApiProperty()
  @IsBoolean()
  alarm!: boolean;

  @ApiProperty({ type: [String], description: 'Households of the caller that send no reminders.' })
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  mutedHouseholdIds!: string[];
}

export class UpcomingReminderDto {
  @ApiProperty({ description: 'Stable across edits of the same occurrence; a series occurrence is keyed by rule and date.' })
  key!: string;

  @ApiProperty({ enum: ['task', 'event'] })
  kind!: 'task' | 'event';

  @ApiProperty() householdId!: string;
  @ApiProperty() householdName!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Null for a series occurrence that has no row yet.' })
  itemId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  occurrenceDate!: string | null;

  @ApiProperty() title!: string;

  @ApiProperty({ description: 'The due or start time.' })
  at!: string;

  @ApiProperty({ description: 'A task without a time, or an all-day event.' })
  dateOnly!: boolean;

  @ApiProperty() fireAt!: string;

  @ApiProperty({ description: 'Ring like an alarm clock until dismissed, where the phone can; otherwise a notification.' })
  alarm!: boolean;

  @ApiProperty({ type: String, nullable: true })
  location!: string | null;
}

export class UpcomingReminderListDto {
  @ApiProperty({ type: [UpcomingReminderDto] })
  reminders!: UpcomingReminderDto[];
}
