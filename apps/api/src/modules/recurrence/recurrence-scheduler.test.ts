import { afterEach, describe, expect, test, vi } from 'vitest';
import type { RecurrenceMaterializerService } from './recurrence-materializer.service.js';
import { RECURRENCE_TICK_MS, RecurrenceScheduler } from './recurrence-scheduler.js';

describe('RecurrenceScheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  test('generates due rules at boot and then once per tick', () => {
    vi.useFakeTimers();
    vi.stubEnv('NODE_ENV', 'production');
    const materializeAllDue = vi.fn().mockResolvedValue(undefined);
    const scheduler = new RecurrenceScheduler({ materializeAllDue } as unknown as RecurrenceMaterializerService);

    scheduler.onApplicationBootstrap();
    expect(materializeAllDue).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(RECURRENCE_TICK_MS);
    expect(materializeAllDue).toHaveBeenCalledTimes(2);

    scheduler.onModuleDestroy();
    vi.advanceTimersByTime(RECURRENCE_TICK_MS);
    expect(materializeAllDue).toHaveBeenCalledTimes(2);
  });
});
