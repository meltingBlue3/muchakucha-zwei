import { Module } from '@nestjs/common';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';
import { RecurrenceModule } from '../recurrence/recurrence.module.js';

@Module({
  imports: [RecurrenceModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
