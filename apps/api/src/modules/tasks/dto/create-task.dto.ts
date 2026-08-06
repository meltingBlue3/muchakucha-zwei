import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { LabelResponseDto } from '../../labels/dto/create-label.dto.js';

export const TASK_STATUSES = ['pending', 'in_progress', 'completed'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export class CreateTaskDto {
  @ApiProperty({ description: '任务标题', minLength: 1, maxLength: 200 })
  @IsString()
  @Length(1, 200)
  title!: string;

  @ApiPropertyOptional({ description: '任务描述' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ description: '任务状态', enum: TASK_STATUSES, default: 'pending' })
  @IsOptional()
  @IsString()
  @IsIn(TASK_STATUSES)
  status?: TaskStatus;

  @ApiPropertyOptional({ description: '任务优先级', enum: TASK_PRIORITIES, default: 'medium' })
  @IsOptional()
  @IsString()
  @IsIn(TASK_PRIORITIES)
  priority?: TaskPriority;

  @ApiPropertyOptional({ description: '负责人成员 ID（必须是当前家庭成员）' })
  @IsOptional()
  @IsUUID('4')
  assigneeId?: string;

  @ApiPropertyOptional({ description: '截止日期' })
  @IsOptional()
  @IsString()
  dueDate?: string;
}

export class TaskResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() householdId!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty({ enum: TASK_STATUSES }) status!: TaskStatus;
  @ApiProperty({ enum: TASK_PRIORITIES }) priority!: TaskPriority;
  @ApiProperty({ nullable: true }) assigneeId!: string | null;
  @ApiProperty({ nullable: true }) dueDate!: string | null;
  @ApiProperty() createdBy!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  @ApiProperty({ type: [LabelResponseDto] })
  labels!: LabelResponseDto[];
}

export class TaskListResponseDto {
  @ApiProperty({ type: [TaskResponseDto] })
  tasks!: TaskResponseDto[];

  @ApiProperty()
  total!: number;
}
