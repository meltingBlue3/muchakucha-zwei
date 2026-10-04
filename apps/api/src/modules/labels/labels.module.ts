import { Module } from '@nestjs/common';
import { LabelsController, EventLabelsController, TaskLabelsController } from './labels.controller.js';
import { LabelsService } from './labels.service.js';

@Module({
  controllers: [LabelsController, EventLabelsController, TaskLabelsController],
  providers: [LabelsService],
  exports: [LabelsService],
})
export class LabelsModule {}
