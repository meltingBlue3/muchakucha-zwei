import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export class CompletePasswordResetDto {
  @ApiProperty({ pattern: OPAQUE_TOKEN_PATTERN.source, writeOnly: true })
  @IsString()
  @Matches(OPAQUE_TOKEN_PATTERN)
  token!: string;

  @ApiProperty({ minLength: 12, maxLength: 128, writeOnly: true })
  @IsString()
  password!: string;
}
