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
    // Tick once at boot as well: after a deploy or restart, rules that came due
    // while the server was down should not wait a whole interval.
    this.tick();
    this.timer = setInterval(() => this.tick(), RECURRENCE_TICK_MS);
    this.timer.unref();
  }

  private tick(): void {
    void this.materializer.materializeAllDue().catch((error: unknown) => {
      this.logger.error('recurrence materialization tick failed', error);
    });
  }

  onModuleDestroy(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}
