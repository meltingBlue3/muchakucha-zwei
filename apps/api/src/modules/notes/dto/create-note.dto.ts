import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { LabelResponseDto } from '../../labels/dto/create-label.dto.js';

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

  @ApiPropertyOptional({ description: 'Labels of this household to put on the note', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  labelIds?: string[];

  @ApiPropertyOptional({ description: 'Pin the note for the whole household' })
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}

/** A note's labels, replaced as a whole; an empty list removes them all. */
export class NoteLabelsDto {
  @ApiProperty({ description: 'Labels of this household; replaces the note\'s labels', type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  labelIds!: string[];
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

  @ApiProperty({ type: String, nullable: true, description: 'Who saved the note last; null once that account is deleted.' })
  updatedBy!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  @ApiProperty({ type: String, nullable: true, description: 'When the note was pinned for the household; null when it is not pinned. Pinning does not change updatedAt.' })
  pinnedAt!: string | null;

  @ApiProperty({ type: [LabelResponseDto], description: 'In the household label list\'s order. Changing them does not change updatedAt.' })
  labels!: LabelResponseDto[];
}

export class NoteListResponseDto {
  @ApiProperty({ type: [NoteResponseDto] })
  notes!: NoteResponseDto[];

  @ApiProperty()
  total!: number;
}
