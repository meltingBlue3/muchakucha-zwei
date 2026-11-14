import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
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
  ApiTags,
} from '@nestjs/swagger';
import { AccessTokenGuard, type AccessTokenClaims } from '../auth/access-token.guard.js';
import { LabelsService } from './labels.service.js';
import { CreateLabelDto, DeleteLabelQueryDto, LabelListResponseDto, LabelResponseDto, TagEntitiesDto, UpdateLabelDto } from './dto/create-label.dto.js';

interface AuthenticatedRequest {
  auth: AccessTokenClaims;
}

// Per-parameter pipes, as in events.controller.ts: an intersection param type
// emits `Object` metadata, which ValidationPipe skips, so a malformed id would
// reach Prisma and surface as a 500.
const uuidParam = new ParseUUIDPipe({ version: '4' });

@ApiTags('labels')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('households/:householdId/labels')
export class LabelsController {
  constructor(private readonly labelsService: LabelsService) {}

  @Post()
  @ApiOperation({ operationId: 'createLabel' })
  @ApiCreatedResponse({ type: LabelResponseDto })
  create(
    @Req() request: AuthenticatedRequest,
    @Param('householdId', uuidParam) householdId: string,
    @Body() input: CreateLabelDto,
  ): Promise<LabelResponseDto> {
    return this.labelsService.create(request.auth.sub, householdId, input);
  }

  @Get()
  @ApiOperation({ operationId: 'listLabels' })
  @ApiOkResponse({ type: LabelListResponseDto })
  list(
    @Req() request: AuthenticatedRequest,
    @Param('householdId', uuidParam) householdId: string,
  ): Promise<LabelListResponseDto> {
    return this.labelsService.list(request.auth.sub, householdId);
  }

  @Put(':labelId')
  @ApiOperation({ operationId: 'updateLabel' })
  @ApiOkResponse({ type: LabelResponseDto })
  update(
    @Req() request: AuthenticatedRequest,
    @Param('householdId', uuidParam) householdId: string,
    @Param('labelId', uuidParam) labelId: string,
    @Body() input: UpdateLabelDto,
  ): Promise<LabelResponseDto> {
    return this.labelsService.update(request.auth.sub, householdId, labelId, input);
  }

  @Delete(':labelId')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteLabel' })
  @ApiNoContentResponse()
  async delete(
    @Req() request: AuthenticatedRequest,
    @Param('householdId', uuidParam) householdId: string,
    @Param('labelId', uuidParam) labelId: string,
    @Query() query: DeleteLabelQueryDto,
  ): Promise<void> {
    const expected = query.expectedName === undefined || query.expectedColor === undefined
      ? undefined
      : { name: query.expectedName, color: query.expectedColor };
    await this.labelsService.delete(request.auth.sub, householdId, labelId, expected);
  }
}

// ---- Tag / Untag sub-controllers on events and tasks ----

@ApiTags('events')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('households/:householdId/events/:eventId/labels')
export class EventLabelsController {
  constructor(private readonly labelsService: LabelsService) {}

  @Post()
  @HttpCode(204)
  @ApiOperation({ operationId: 'tagEvent' })
  @ApiNoContentResponse()
  async tag(
    @Req() request: AuthenticatedRequest,
    @Param('householdId', uuidParam) householdId: string,
    @Param('eventId', uuidParam) eventId: string,
    @Body() input: TagEntitiesDto,
  ): Promise<void> {
    await this.labelsService.tagEvent(request.auth.sub, householdId, eventId, input);
  }

  @Delete(':labelId')
  @HttpCode(204)
  @ApiOperation({ operationId: 'untagEvent' })
  @ApiNoContentResponse()
  async untag(
    @Req() request: AuthenticatedRequest,
    @Param('householdId', uuidParam) householdId: string,
    @Param('eventId', uuidParam) eventId: string,
    @Param('labelId', uuidParam) labelId: string,
  ): Promise<void> {
    await this.labelsService.untagEvent(request.auth.sub, householdId, eventId, labelId);
  }
}

@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@Controller('households/:householdId/tasks/:taskId/labels')
export class TaskLabelsController {
  constructor(private readonly labelsService: LabelsService) {}

  @Post()
  @HttpCode(204)
  @ApiOperation({ operationId: 'tagTask' })
  @ApiNoContentResponse()
  async tag(
    @Req() request: AuthenticatedRequest,
    @Param('householdId', uuidParam) householdId: string,
    @Param('taskId', uuidParam) taskId: string,
    @Body() input: TagEntitiesDto,
  ): Promise<void> {
    await this.labelsService.tagTask(request.auth.sub, householdId, taskId, input);
  }

  @Delete(':labelId')
  @HttpCode(204)
  @ApiOperation({ operationId: 'untagTask' })
  @ApiNoContentResponse()
  async untag(
    @Req() request: AuthenticatedRequest,
    @Param('householdId', uuidParam) householdId: string,
    @Param('taskId', uuidParam) taskId: string,
    @Param('labelId', uuidParam) labelId: string,
  ): Promise<void> {
    await this.labelsService.untagTask(request.auth.sub, householdId, taskId, labelId);
  }
}
