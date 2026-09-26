import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'family_member', minLength: 3, maxLength: 64, description: 'Allows Unicode lowercase expansion of a registered username.' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().normalize('NFC') : value)
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^[\p{L}\p{M}\p{N}._-]+$/u)
  username!: string;

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
