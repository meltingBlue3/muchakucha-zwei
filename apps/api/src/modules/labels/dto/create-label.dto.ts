import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

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

/** Labels have no updatedAt; the name and colour read before deleting are its version. Send both or neither. */
export class DeleteLabelQueryDto {
  @ApiPropertyOptional({ description: 'Name read before deleting; with expectedColor, a changed label returns 409 EDIT_CONFLICT.' })
  @ValidateIf((query: DeleteLabelQueryDto) => query.expectedName !== undefined || query.expectedColor !== undefined)
  @IsString()
  expectedName?: string;

  @ApiPropertyOptional({ description: 'Colour read before deleting; sent with expectedName.' })
  @ValidateIf((query: DeleteLabelQueryDto) => query.expectedName !== undefined || query.expectedColor !== undefined)
  @IsString()
  expectedColor?: string;
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

/**
 * The edit request also carries the name and colour read before editing, as
 * a delete does. Kept off UpdateLabelDto: the assistant's arguments extend it
 * and require both, which an inherited ValidateIf would let them skip.
 */
export class UpdateLabelRequestDto extends UpdateLabelDto {
  @ApiPropertyOptional({ description: 'Name read before editing; with expectedColor, a changed label returns 409 EDIT_CONFLICT.' })
  @ValidateIf((input: UpdateLabelRequestDto) => input.expectedName !== undefined || input.expectedColor !== undefined)
  @IsString()
  expectedName?: string;

  @ApiPropertyOptional({ description: 'Colour read before editing; sent with expectedName.' })
  @ValidateIf((input: UpdateLabelRequestDto) => input.expectedName !== undefined || input.expectedColor !== undefined)
  @IsString()
  expectedColor?: string;
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
