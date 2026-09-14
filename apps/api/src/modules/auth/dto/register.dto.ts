import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

export type RegistrationPlatform = 'native' | 'web';

export class RegisterDto {
  @ApiPropertyOptional({ example: 'family_member', minLength: 3, maxLength: 32, description: 'Use username and confirmPassword for immediate registration.' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().normalize('NFC') : value)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[\p{L}\p{N}._-]+$/u)
  username?: string;

  @ApiPropertyOptional({ example: 'member@example.com', maxLength: 320, description: 'Legacy email registration; cannot be combined with username.' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(320)
  email?: string;

  @ApiPropertyOptional({ example: 'Member', maxLength: 80, description: 'Required only for legacy email registration.' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName?: string;

  @ApiProperty({ minLength: 8, maxLength: 128, writeOnly: true })
  @IsString()
  password!: string;

  @ApiPropertyOptional({ minLength: 8, maxLength: 128, writeOnly: true, description: 'Required and must match password for username registration.' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(128)
  confirmPassword?: string;

  @ApiProperty({ enum: ['native', 'web'] })
  @IsString()
  @IsIn(['native', 'web'])
  platform!: RegistrationPlatform;
}

export class RegistrationAcceptedDto {
  @ApiProperty({ enum: ['REGISTRATION_ACCEPTED'] })
  code!: 'REGISTRATION_ACCEPTED';

  @ApiProperty({ required: false, description: 'Native-only pending proof for encrypted device storage.' })
  pendingProof?: string;

  @ApiPropertyOptional({ description: 'Access credential issued immediately for username registration.' })
  accessToken?: string;

  @ApiPropertyOptional({ description: 'Native-only refresh credential for username registration.' })
  refreshToken?: string;
}
