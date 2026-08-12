import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { RecurrenceMaterializerService } from './recurrence-materializer.service.js';

export const RECURRENCE_TICK_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class RecurrenceScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RecurrenceScheduler.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly materializer: RecurrenceMaterializerService) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      void this.materializer.materializeAllDue().catch((error: unknown) => {
        this.logger.error('recurrence materialization tick failed', error);
      });
    }, RECURRENCE_TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}
