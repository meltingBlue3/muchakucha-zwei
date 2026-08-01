import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export type RegistrationPlatform = 'native' | 'web';

export class RegisterDto {
  @ApiProperty({ example: 'member@example.com', maxLength: 320 })
  @IsString()
  @MinLength(1)
  @MaxLength(320)
  email!: string;

  @ApiProperty({ example: 'Member', maxLength: 80 })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName!: string;

  @ApiProperty({ minLength: 12, maxLength: 128, writeOnly: true })
  @IsString()
  password!: string;

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
}
