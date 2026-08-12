import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { RecurrenceMaterializerService } from './recurrence-materializer.service.js';

// D-18/D-11: daily's lookahead is 0, so a rule's "today" row must appear
// within roughly an hour of its own local midnight — a coarser tick (the
// previous 6h) would let a household see stale generation for hours after
// crossing midnight in its own timezone.
export const RECURRENCE_TICK_MS = 60 * 60 * 1000;

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
