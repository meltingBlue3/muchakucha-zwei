import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsObject, IsString, MaxLength, ValidateIf, ValidateNested } from 'class-validator';

const PUSH_LANGUAGES = ['zh', 'ja'] as const;
const PUSH_PROVIDERS = ['expo', 'fcm', 'web'] as const;
export const EXPO_TOKEN_PATTERN = /^Expo(?:nent)?PushToken\[[\w-]+\]$/;
export const FCM_TOKEN_PATTERN = /^[\w:.-]+$/;

class WebPushKeysDto {
  @ApiProperty({ description: 'The 65-byte subscription public key in unpadded base64url.', maxLength: 87 })
  @IsString()
  @MaxLength(87)
  p256dh!: string;

  @ApiProperty({ description: 'The 16-byte subscription authentication secret in unpadded base64url.', maxLength: 22 })
  @IsString()
  @MaxLength(22)
  auth!: string;
}

export class RegisterReminderPushDto {
  @ApiProperty({ maxLength: 1024 })
  @MaxLength(1024)
  @IsString()
  token!: string;

  @ApiPropertyOptional({ enum: PUSH_PROVIDERS, default: 'expo' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(PUSH_PROVIDERS)
  provider?: (typeof PUSH_PROVIDERS)[number];

  @ApiPropertyOptional({ type: WebPushKeysDto, description: 'Required when provider is web.' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => WebPushKeysDto)
  keys?: WebPushKeysDto;

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
