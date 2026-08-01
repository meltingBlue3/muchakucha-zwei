import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class RefreshDto {
  @ApiPropertyOptional({ description: 'Native-only opaque refresh credential.', minLength: 1 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  refreshToken?: string;
}

export class RefreshResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiPropertyOptional({ description: 'Native-only rotated refresh credential. Web responses omit this property.' })
  refreshToken?: string;
}
