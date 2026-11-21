import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsString, MaxLength, ValidateIf } from 'class-validator';

const PUSH_LANGUAGES = ['zh', 'ja'] as const;
const PUSH_PROVIDERS = ['expo', 'fcm'] as const;
export const EXPO_TOKEN_PATTERN = /^Expo(?:nent)?PushToken\[[\w-]+\]$/;
export const FCM_TOKEN_PATTERN = /^[\w:.-]+$/;

export class RegisterReminderPushDto {
  @ApiProperty({ maxLength: 512 })
  @MaxLength(512)
  @IsString()
  token!: string;

  @ApiPropertyOptional({ enum: PUSH_PROVIDERS, default: 'expo' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(PUSH_PROVIDERS)
  provider?: (typeof PUSH_PROVIDERS)[number];

  @ApiProperty({ example: 'Asia/Shanghai', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  timeZone!: string;

  @ApiProperty({ enum: PUSH_LANGUAGES })
  @IsIn(PUSH_LANGUAGES)
  language!: (typeof PUSH_LANGUAGES)[number];

  @ApiProperty({ description: 'Whether this device schedules ringing alarms locally.' })
  @IsBoolean()
  localAlarms!: boolean;
}

export class ReminderPushStatusDto {
  @ApiProperty({ description: 'Whether this session should receive ordinary reminders by push.' })
  active!: boolean;
}
