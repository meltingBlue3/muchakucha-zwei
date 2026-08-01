import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export type VerificationOutcome =
  | 'verified_auto_login'
  | 'verified_login_required'
  | 'expired'
  | 'used'
  | 'invalid'
  | 'superseded';

const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export class CompleteEmailVerificationDto {
  @ApiProperty({ pattern: OPAQUE_TOKEN_PATTERN.source, writeOnly: true })
  @IsString()
  @Matches(OPAQUE_TOKEN_PATTERN)
  token!: string;

  @ApiProperty({ enum: ['native'], required: false })
  @IsOptional()
  @IsString()
  @IsIn(['native'])
  platform?: 'native';

  @ApiProperty({ pattern: OPAQUE_TOKEN_PATTERN.source, required: false, writeOnly: true })
  @IsOptional()
  @IsString()
  @Matches(OPAQUE_TOKEN_PATTERN)
  pendingProof?: string;
}

export class CompleteEmailVerificationResponseDto {
  @ApiProperty({
    enum: ['verified_auto_login', 'verified_login_required', 'expired', 'used', 'invalid', 'superseded'],
  })
  outcome!: VerificationOutcome;

  @ApiProperty({ required: false, description: 'Short-lived access credential issued only for same-device success.' })
  accessToken?: string;

  @ApiProperty({ required: false, description: 'Native-only refresh credential for encrypted device storage.' })
  refreshToken?: string;
}
