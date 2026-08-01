import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RequestPasswordResetDto {
  @ApiProperty({ example: 'member@example.com', maxLength: 320 })
  @IsString()
  @MinLength(1)
  @MaxLength(320)
  email!: string;
}

export class PasswordResetRequestAcceptedDto {
  @ApiProperty({ enum: ['PASSWORD_RESET_REQUEST_ACCEPTED'] })
  code!: 'PASSWORD_RESET_REQUEST_ACCEPTED';
}
