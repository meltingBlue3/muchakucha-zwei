import { moveEventStart } from '../event-form';

test('moving the start date carries a multi-day end along', () => {
  expect(moveEventStart(
    { startDate: '2026-09-27', startTime: '09:00', endDate: '2026-09-28', endTime: '10:00' },
    { startDate: '2026-10-03' },
  )).toEqual({ startDate: '2026-10-03', startTime: '09:00', endDate: '2026-10-04', endTime: '10:00' });
});

test('moving the start time keeps the length, crossing midnight when needed', () => {
  expect(moveEventStart(
    { startDate: '2026-09-27', startTime: '09:00', endDate: '2026-09-27', endTime: '10:30' },
    { startTime: '23:00' },
  )).toEqual({ startDate: '2026-09-27', startTime: '23:00', endDate: '2026-09-28', endTime: '00:30' });
});

test('an end already before the start stays where the user put it', () => {
  expect(moveEventStart(
    { startDate: '2026-09-27', startTime: '11:00', endDate: '2026-09-27', endTime: '10:00' },
    { startDate: '2026-09-29' },
  )).toEqual({ startDate: '2026-09-29', startTime: '11:00', endDate: '2026-09-27', endTime: '10:00' });
});
