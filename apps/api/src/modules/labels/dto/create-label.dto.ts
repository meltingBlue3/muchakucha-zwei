import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const LABEL_COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#84CC16', '#10B981',
  '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899', '#6B7280',
] as const;

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
  @IsString({ each: true })
  labelIds!: string[];
}
