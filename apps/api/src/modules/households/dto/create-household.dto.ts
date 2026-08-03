import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateHouseholdDto {
  @ApiProperty({ example: 'My Family', minLength: 1, maxLength: 40, description: '1–40 Unicode code points after trim and NFC normalization.' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().normalize('NFC') : value)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;
}

export class MembershipResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ format: 'uuid' })
  householdId!: string;

  @ApiProperty({ enum: ['ADMIN', 'MEMBER'] })
  role!: 'ADMIN' | 'MEMBER';
}

export class CreateHouseholdResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'My Family' })
  name!: string;

  @ApiProperty({ format: 'uuid' })
  ownerMembershipId!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  membership!: MembershipResponseDto;
}

export class ListMyHouseholdsItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'My Family' })
  name!: string;

  @ApiProperty({ enum: ['ADMIN', 'MEMBER'] })
  role!: 'ADMIN' | 'MEMBER';

  @ApiProperty({ example: 3 })
  memberCount!: number;

  @ApiProperty({ format: 'uuid' })
  ownerMembershipId!: string;
}
