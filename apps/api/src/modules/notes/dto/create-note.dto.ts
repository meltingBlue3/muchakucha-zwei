import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateNoteDto {
  @ApiProperty({ description: 'Note title', minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: 'Optional note body (Markdown)' })
  @IsOptional()
  @IsString()
  body?: string;
}

export class NoteResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  householdId!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional()
  body?: string | null;

  @ApiProperty()
  createdBy!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class NoteListResponseDto {
  @ApiProperty({ type: [NoteResponseDto] })
  notes!: NoteResponseDto[];

  @ApiProperty()
  total!: number;
}
