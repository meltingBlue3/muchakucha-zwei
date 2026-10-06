import { describe, expect, test } from 'vitest';
import { allDayBounds, describeNow, localStamp } from './assistant-time.js';

describe('assistant wall-clock views', () => {
  test('the current time is the user’s local date and weekday, not the UTC day', () => {
    expect(describeNow('Asia/Shanghai', new Date('2026-10-05T16:30:00Z'))).toBe('2026-10-06 周二 00:30（Asia/Shanghai，UTC+08:00）');
    expect(describeNow('UTC', new Date('2026-10-05T16:30:00Z'))).toBe('2026-10-05 周一 16:30（UTC，UTC+00:00）');
    expect(describeNow('America/New_York', new Date('2026-10-06T02:00:00Z'))).toBe('2026-10-05 周一 22:00（America/New_York，UTC-04:00）');
  });

  test('due stamps omit local midnight the way the app stores a date without a time', () => {
    expect(localStamp('2026-10-05T16:00:00.000Z', 'Asia/Shanghai', 'due')).toBe('2026-10-06 周二');
    expect(localStamp('2026-10-05T16:30:00.000Z', 'Asia/Shanghai', 'due')).toBe('2026-10-06 周二 00:30');
  });

  test('all-day bounds match the app’s 00:00:00 to 23:59:59 local convention', () => {
    expect(allDayBounds('2026-10-07T09:00:00+08:00', '2026-10-07T18:00:00+08:00', 'Asia/Shanghai'))
      .toEqual({ startTime: '2026-10-06T16:00:00.000Z', endTime: '2026-10-07T15:59:59.000Z' });
    // A zero-length midnight span stays one day rather than ending before it starts.
    expect(allDayBounds('2026-10-07T00:00:00+08:00', '2026-10-07T00:00:00+08:00', 'Asia/Shanghai'))
      .toEqual({ startTime: '2026-10-06T16:00:00.000Z', endTime: '2026-10-07T15:59:59.000Z' });
  });
});
