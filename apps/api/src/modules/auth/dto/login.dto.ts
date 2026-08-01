import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'member@example.com', maxLength: 320 })
  @IsEmail()
  @MaxLength(320)
  email!: string;

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
