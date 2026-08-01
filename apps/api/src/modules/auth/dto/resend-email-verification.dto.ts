import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResendEmailVerificationDto {
  @ApiProperty({ example: 'member@example.com', maxLength: 320 })
  @IsString()
  @MinLength(1)
  @MaxLength(320)
  email!: string;
}

export class ResendEmailVerificationResponseDto {
  @ApiProperty({ enum: ['RESEND_ACCEPTED'] })
  code!: 'RESEND_ACCEPTED';

  @ApiProperty({ example: 60, minimum: 1 })
  retryAfterSeconds!: number;
}
