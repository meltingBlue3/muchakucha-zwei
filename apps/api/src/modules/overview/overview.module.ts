import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { OverviewController } from './overview.controller.js';
import { OverviewService } from './overview.service.js';

@Module({
  imports: [EventsModule, TasksModule],
  controllers: [OverviewController],
  providers: [OverviewService],
})
export class OverviewModule {}
