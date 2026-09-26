import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export type RegistrationPlatform = 'native' | 'web';

export class RegisterDto {
  @ApiProperty({ example: 'family_member', minLength: 3, maxLength: 32, description: 'Use username and confirmPassword for immediate registration.' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().normalize('NFC') : value)
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[\p{L}\p{N}._-]+$/u)
  username!: string;

  @ApiProperty({ minLength: 8, maxLength: 128, writeOnly: true })
  @IsString()
  password!: string;

  @ApiProperty({ minLength: 8, maxLength: 128, writeOnly: true, description: 'Required and must match password for username registration.' })
  @IsString()
  @MaxLength(128)
  confirmPassword!: string;

  @ApiProperty({ enum: ['native', 'web'] })
  @IsString()
  @IsIn(['native', 'web'])
  platform!: RegistrationPlatform;
}

export class RegistrationAcceptedDto {
  @ApiProperty({ enum: ['REGISTRATION_ACCEPTED'] })
  code!: 'REGISTRATION_ACCEPTED';

  @ApiProperty({ description: 'Access credential issued immediately for username registration.' })
  accessToken!: string;

  @ApiPropertyOptional({ description: 'Native-only refresh credential for username registration.' })
  refreshToken?: string;
}
