import { Module } from '@nestjs/common';
import { RecurrenceMaterializerService } from './recurrence-materializer.service.js';
import { RecurrenceScheduler } from './recurrence-scheduler.js';

@Module({
  providers: [RecurrenceMaterializerService, RecurrenceScheduler],
  exports: [RecurrenceMaterializerService],
})
export class RecurrenceModule {}
