import { ApiProperty } from '@nestjs/swagger';

export class GetHouseholdMemberDto {
  @ApiProperty({ format: 'uuid' })
  membershipId!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ example: '家主' })
  displayName!: string;

  @ApiProperty({ format: 'email', example: 'owner@example.test' })
  email!: string;

  @ApiProperty({ enum: ['OWNER', 'ADMIN', 'MEMBER'] })
  role!: 'OWNER' | 'ADMIN' | 'MEMBER';

  @ApiProperty()
  isCurrentUser!: boolean;
}

export class GetHouseholdResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: '温暖小家' })
  name!: string;

  @ApiProperty({ format: 'uuid' })
  ownerMembershipId!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty({ type: [GetHouseholdMemberDto] })
  members!: GetHouseholdMemberDto[];
}
