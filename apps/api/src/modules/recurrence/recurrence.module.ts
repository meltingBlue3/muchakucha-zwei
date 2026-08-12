import { Module } from '@nestjs/common';
import { RecurrenceMaterializerService } from './recurrence-materializer.service.js';

@Module({
  providers: [RecurrenceMaterializerService],
  exports: [RecurrenceMaterializerService],
})
export class RecurrenceModule {}
