import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
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
import { CreateLabelDto, LabelListResponseDto, LabelResponseDto, TagEntitiesDto, UpdateLabelDto } from './dto/create-label.dto.js';
import { IsUUID } from 'class-validator';

interface AuthenticatedRequest {
  auth: AccessTokenClaims;
}

class HouseholdIdParam {
  @IsUUID('4')
  householdId!: string;
}

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
    @Param() params: HouseholdIdParam,
    @Body() input: CreateLabelDto,
  ): Promise<LabelResponseDto> {
    return this.labelsService.create(request.auth.sub, params.householdId, input);
  }

  @Get()
  @ApiOperation({ operationId: 'listLabels' })
  @ApiOkResponse({ type: LabelListResponseDto })
  list(
    @Req() request: AuthenticatedRequest,
    @Param() params: HouseholdIdParam,
  ): Promise<LabelListResponseDto> {
    return this.labelsService.list(request.auth.sub, params.householdId);
  }

  @Put(':labelId')
  @ApiOperation({ operationId: 'updateLabel' })
  @ApiOkResponse({ type: LabelResponseDto })
  update(
    @Req() request: AuthenticatedRequest,
    @Param() params: HouseholdIdParam & { labelId: string },
    @Body() input: UpdateLabelDto,
  ): Promise<LabelResponseDto> {
    return this.labelsService.update(request.auth.sub, params.householdId, params.labelId, input);
  }

  @Delete(':labelId')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteLabel' })
  @ApiNoContentResponse()
  async delete(
    @Req() request: AuthenticatedRequest,
    @Param() params: HouseholdIdParam & { labelId: string },
  ): Promise<void> {
    await this.labelsService.delete(request.auth.sub, params.householdId, params.labelId);
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
    @Param() params: HouseholdIdParam & { eventId: string },
    @Body() input: TagEntitiesDto,
  ): Promise<void> {
    await this.labelsService.tagEvent(request.auth.sub, params.householdId, params.eventId, input);
  }

  @Delete(':labelId')
  @HttpCode(204)
  @ApiOperation({ operationId: 'untagEvent' })
  @ApiNoContentResponse()
  async untag(
    @Req() request: AuthenticatedRequest,
    @Param() params: HouseholdIdParam & { eventId: string; labelId: string },
  ): Promise<void> {
    await this.labelsService.untagEvent(request.auth.sub, params.householdId, params.eventId, params.labelId);
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
    @Param() params: HouseholdIdParam & { taskId: string },
    @Body() input: TagEntitiesDto,
  ): Promise<void> {
    await this.labelsService.tagTask(request.auth.sub, params.householdId, params.taskId, input);
  }

  @Delete(':labelId')
  @HttpCode(204)
  @ApiOperation({ operationId: 'untagTask' })
  @ApiNoContentResponse()
  async untag(
    @Req() request: AuthenticatedRequest,
    @Param() params: HouseholdIdParam & { taskId: string; labelId: string },
  ): Promise<void> {
    await this.labelsService.untagTask(request.auth.sub, params.householdId, params.taskId, params.labelId);
  }
}
