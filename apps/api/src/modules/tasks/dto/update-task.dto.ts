import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { TASK_PRIORITIES, TASK_STATUSES } from './create-task.dto.js';

export class UpdateTaskDto {
  @ApiPropertyOptional({ description: '任务标题', minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @ApiPropertyOptional({ description: '任务描述' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ description: '任务状态', enum: TASK_STATUSES })
  @IsOptional()
  @IsString()
  @IsIn(TASK_STATUSES)
  status?: string;

  @ApiPropertyOptional({ description: '任务优先级', enum: TASK_PRIORITIES })
  @IsOptional()
  @IsString()
  @IsIn(TASK_PRIORITIES)
  priority?: string;

  @ApiPropertyOptional({ description: '负责人成员 ID（传空字符串或 null 可清除）' })
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional({ description: '截止日期' })
  @IsOptional()
  @IsString()
  dueDate?: string;
}
