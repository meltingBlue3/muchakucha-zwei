import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { TaskResponseDto } from '../../tasks/dto/create-task.dto.js';

/** Which of the caller's households their 总览 shows. At least one stays chosen. */
export class UpdateOverviewHouseholdsDto {
  @ApiProperty({ type: [String], minItems: 1, description: 'Households to show in the 总览; every one must be yours.' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  householdIds!: string[];
}

export class OverviewHouseholdsDto {
  @ApiProperty({ type: [String] })
  householdIds!: string[];
}

/** A member of one of the households in the 总览, so its tasks can name their assignees. */
export class OverviewMemberDto {
  @ApiProperty() householdId!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() displayName!: string;
}

export class OverviewTaskListResponseDto {
  @ApiProperty({ type: [TaskResponseDto] })
  tasks!: TaskResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty({ nullable: true })
  materializedThrough!: string | null;

  @ApiProperty({ type: [OverviewMemberDto] })
  members!: OverviewMemberDto[];
}
