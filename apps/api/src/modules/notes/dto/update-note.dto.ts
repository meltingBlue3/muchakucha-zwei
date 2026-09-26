import { IsDateString as IsEditDate } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateNoteDto {
  @ApiProperty({ description: 'Required version read before editing; stale writes return 409 EDIT_CONFLICT.' })
  @IsEditDate()
  expectedUpdatedAt!: string;

  @ApiPropertyOptional({ description: 'Note title', minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Optional note body (Markdown)' })
  @IsOptional()
  @IsString()
  body?: string;
}
