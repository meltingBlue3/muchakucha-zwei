import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateLabelDto {
  @ApiProperty({ description: 'Label name', minLength: 1, maxLength: 40 })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  @Matches(/^\S/, { message: 'Name must not start with whitespace.' })
  name!: string;

  @ApiProperty({ description: 'Hex color (e.g. #EF4444)', pattern: '^#[0-9A-Fa-f]{6}$' })
  @IsString()
  color!: string;
}

export class UpdateLabelDto {
  @ApiPropertyOptional({ description: 'Label name', minLength: 1, maxLength: 40 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  @Matches(/^\S/, { message: 'Name must not start with whitespace.' })
  name?: string;

  @ApiPropertyOptional({ description: 'Hex color (e.g. #EF4444)', pattern: '^#[0-9A-Fa-f]{6}$' })
  @IsOptional()
  @IsString()
  color?: string;
}

export class LabelResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  householdId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  color!: string;

  @ApiProperty()
  createdBy!: string;

  @ApiProperty()
  createdAt!: string;
}

export class LabelListResponseDto {
  @ApiProperty({ type: [LabelResponseDto] })
  labels!: LabelResponseDto[];

  @ApiProperty()
  total!: number;
}

export class TagEntitiesDto {
  @ApiProperty({ description: 'Label IDs to apply', type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  labelIds!: string[];
}
