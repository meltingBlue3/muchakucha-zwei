import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class LoginDto {
  @ApiPropertyOptional({ example: 'family_member', minLength: 3, maxLength: 64, description: 'Allows Unicode lowercase expansion of a registered username.' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().normalize('NFC') : value)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^[\p{L}\p{M}\p{N}._-]+$/u)
  username?: string;

  @ApiPropertyOptional({ example: 'member@example.com', maxLength: 320, description: 'Legacy email login; supply exactly one of username or email.' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @ApiProperty({ minLength: 1, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ enum: ['native', 'web'] })
  @IsIn(['native', 'web'])
  platform!: 'native' | 'web';
}

export class LoginResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiPropertyOptional({ description: 'Native-only refresh credential. Web responses omit this property.' })
  refreshToken?: string;
}
