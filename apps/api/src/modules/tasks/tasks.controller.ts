import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AccessTokenGuard, type AccessTokenClaims } from '../auth/access-token.guard.js';
import { TasksService } from './tasks.service.js';
import type { CreateTaskDto, TaskListResponseDto, TaskResponseDto } from './dto/create-task.dto.js';
import type { UpdateTaskDto } from './dto/update-task.dto.js';

interface AuthenticatedRequest {
  auth: AccessTokenClaims;
}

@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('households/:householdId/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiOperation({ operationId: 'createTask' })
  @ApiCreatedResponse({ type: Object as any })
  async create(
    @Req() request: AuthenticatedRequest,
    @Param('householdId') householdId: string,
    @Body() body: CreateTaskDto,
  ): Promise<TaskResponseDto> {
    return this.tasksService.create(request.auth.sub, householdId, body);
  }

  @Get()
  @ApiOperation({ operationId: 'listTasks' })
  @ApiOkResponse({ type: Object as any })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'assigneeId', required: false })
  async list(
    @Req() request: AuthenticatedRequest,
    @Param('householdId') householdId: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('assigneeId') assigneeId?: string,
  ): Promise<TaskListResponseDto> {
    return this.tasksService.list(request.auth.sub, householdId, { status, priority, assigneeId });
  }

  @Get(':taskId')
  @ApiOperation({ operationId: 'getTask' })
  @ApiOkResponse({ type: Object as any })
  async getById(
    @Req() request: AuthenticatedRequest,
    @Param('householdId') householdId: string,
    @Param('taskId') taskId: string,
  ): Promise<TaskResponseDto> {
    return this.tasksService.getById(request.auth.sub, householdId, taskId);
  }

  @Put(':taskId')
  @ApiOperation({ operationId: 'updateTask' })
  @ApiOkResponse({ type: Object as any })
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('householdId') householdId: string,
    @Param('taskId') taskId: string,
    @Body() body: UpdateTaskDto,
  ): Promise<TaskResponseDto> {
    return this.tasksService.update(request.auth.sub, householdId, taskId, body);
  }

  @Delete(':taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ operationId: 'deleteTask' })
  @ApiNoContentResponse()
  async delete(
    @Req() request: AuthenticatedRequest,
    @Param('householdId') householdId: string,
    @Param('taskId') taskId: string,
  ): Promise<void> {
    await this.tasksService.delete(request.auth.sub, householdId, taskId);
  }
}
