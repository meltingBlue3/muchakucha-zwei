import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateMeDto {
  @ApiProperty({ example: 'Family member', minLength: 1, maxLength: 80 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName!: string;
}

export class CurrentUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'member@example.com' })
  email!: string;

  @ApiPropertyOptional({ example: 'family_member' })
  username?: string;

  @ApiProperty({ example: 'Family member' })
  displayName!: string;

  @ApiProperty()
  emailVerified!: boolean;

  @ApiProperty({ description: 'Phase 1 handoff signal; household lookup begins in Phase 2.' })
  hasHousehold!: false;
}
