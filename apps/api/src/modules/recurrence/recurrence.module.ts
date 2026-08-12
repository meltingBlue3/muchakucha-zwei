import { Module } from '@nestjs/common';
import { RecurrenceMaterializerService } from './recurrence-materializer.service.js';
import { RecurrenceScheduler } from './recurrence-scheduler.js';
import { RecurrenceService } from './recurrence.service.js';

@Module({
  providers: [RecurrenceMaterializerService, RecurrenceScheduler, RecurrenceService],
  exports: [RecurrenceMaterializerService, RecurrenceService],
})
export class RecurrenceModule {}
