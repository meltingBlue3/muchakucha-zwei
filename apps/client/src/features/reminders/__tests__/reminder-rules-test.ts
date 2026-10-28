import {
  alarmOptions,
  alarmSummary,
  alarmValue,
  choiceFromValue,
  DEFAULT_REMINDER,
  fitChoice,
  isOwnTask,
  minutesLabel,
  reminderDetail,
  reminderOptions,
  reminderSummary,
  sameChoice,
} from '../reminder-rules';

const defaults = { taskMinutesBefore: 0, eventMinutesBefore: 15, dateOnlyTime: '09:00', alarm: false };

describe('minutesLabel', () => {
  test('names a timed reminder by how far ahead it comes, in the words of each kind', () => {
    expect(minutesLabel(0, 'task', false, '09:00')).toBe('准时');
    expect(minutesLabel(30, 'task', false, '09:00')).toBe('提前 30 分钟');
    expect(minutesLabel(60, 'task', false, '09:00')).toBe('提前 1 小时');
    expect(minutesLabel(1440, 'task', false, '09:00')).toBe('提前 1 天');
    expect(minutesLabel(0, 'event', false, '09:00')).toBe('开始时');
    expect(minutesLabel(15, 'event', false, '09:00')).toBe('开始前 15 分钟');
  });

  test('names a date-only reminder by its clock time', () => {
    expect(minutesLabel(0, 'task', true, '09:00')).toBe('当天 09:00');
    expect(minutesLabel(1440, 'event', true, '20:30')).toBe('前一天 20:30');
    expect(minutesLabel(30, 'task', true, '00:15')).toBe('前一天 23:45');
  });
});

describe('reminderSummary', () => {
  test('reads on its own, marking the default', () => {
    expect(reminderSummary(DEFAULT_REMINDER, { kind: 'task', own: true, dateOnly: false, defaults })).toBe('准时提醒（默认）');
    expect(reminderSummary(DEFAULT_REMINDER, { kind: 'event', own: true, dateOnly: false, defaults })).toBe('开始前 15 分钟提醒（默认）');
    expect(reminderSummary(DEFAULT_REMINDER, { kind: 'task', own: true, dateOnly: true, defaults })).toBe('当天 09:00 提醒（默认）');
    expect(reminderSummary({ mode: 'before', minutesBefore: 30 }, { kind: 'task', own: true, dateOnly: false, defaults })).toBe('提前 30 分钟提醒');
    expect(reminderSummary({ mode: 'off', minutesBefore: null }, { kind: 'event', own: true, dateOnly: false, defaults })).toBe('不提醒');
  });

  test('someone else\'s task does not remind this person unless they ask for it', () => {
    expect(reminderSummary(DEFAULT_REMINDER, { kind: 'task', own: false, dateOnly: false, defaults })).toBe('不提醒（默认）');
    expect(reminderOptions({ kind: 'task', own: false, dateOnly: false, defaults })[0]).toEqual({ value: 'default', label: '默认（不提醒）' });
  });

  test('says only 默认 until the settings are known', () => {
    expect(reminderSummary(DEFAULT_REMINDER, { kind: 'task', own: true, dateOnly: false, defaults: null })).toBe('默认提醒');
    expect(reminderOptions({ kind: 'task', own: true, dateOnly: false, defaults: null })[0]?.label).toBe('默认');
  });
});

describe('reminderOptions', () => {
  test('offer minutes for a timed item and days at the date-only time otherwise', () => {
    expect(reminderOptions({ kind: 'task', own: true, dateOnly: false, defaults }).map(option => option.label))
      .toEqual(['默认（准时）', '不提醒', '准时', '提前 5 分钟', '提前 15 分钟', '提前 30 分钟', '提前 1 小时', '提前 1 天']);
    expect(reminderOptions({ kind: 'event', own: true, dateOnly: true, defaults }).map(option => option.label))
      .toEqual(['默认（当天 09:00）', '不提醒', '当天 09:00', '前一天 09:00']);
  });
});

describe('fitChoice', () => {
  test('a choice the options no longer offer goes back to the default', () => {
    expect(fitChoice({ mode: 'before', minutesBefore: 15 }, true)).toEqual(DEFAULT_REMINDER);
    expect(fitChoice({ mode: 'before', minutesBefore: 1440 }, true)).toEqual({ mode: 'before', minutesBefore: 1440 });
    expect(fitChoice({ mode: 'off', minutesBefore: null }, true)).toEqual({ mode: 'off', minutesBefore: null });
  });

  test('keeps the choice to ring when the time goes back to the default', () => {
    expect(fitChoice({ mode: 'before', minutesBefore: 15, alarm: true }, true)).toEqual({ mode: 'default', minutesBefore: null, alarm: true });
  });
});

describe('alarm choices', () => {
  test('are separate from the time, and dropped with the reminder itself', () => {
    expect(choiceFromValue('30', 'on')).toEqual({ mode: 'before', minutesBefore: 30, alarm: true });
    expect(choiceFromValue('default', 'off')).toEqual({ mode: 'default', minutesBefore: null, alarm: false });
    expect(choiceFromValue('default')).toEqual(DEFAULT_REMINDER);
    expect(choiceFromValue('off', 'on')).toEqual({ mode: 'off', minutesBefore: null, alarm: null });
    expect(alarmValue({ mode: 'default', minutesBefore: null })).toBe('default');
  });

  test('count as a change of their own', () => {
    expect(sameChoice(DEFAULT_REMINDER, { mode: 'default', minutesBefore: null, alarm: true })).toBe(false);
    // An older response without the field follows the default, as null does.
    expect(sameChoice(DEFAULT_REMINDER, { mode: 'default', minutesBefore: null })).toBe(true);
  });

  test('read on their own, marking the default', () => {
    expect(alarmSummary(DEFAULT_REMINDER, defaults)).toBe('普通提醒（默认）');
    expect(alarmSummary(DEFAULT_REMINDER, { alarm: true })).toBe('闹铃提醒（默认）');
    expect(alarmSummary({ mode: 'before', minutesBefore: 0, alarm: true }, defaults)).toBe('闹铃提醒');
    expect(alarmSummary({ mode: 'before', minutesBefore: 0, alarm: false }, { alarm: true })).toBe('普通提醒');
    expect(alarmSummary(DEFAULT_REMINDER, null)).toBe('默认提醒方式');
    expect(alarmOptions({ alarm: true }).map(option => option.label)).toEqual(['默认（闹铃提醒）', '闹铃提醒', '普通提醒']);
  });
});

describe('isOwnTask', () => {
  test('belongs to its assignees, or to its creator while nobody is assigned', () => {
    expect(isOwnTask({ assigneeIds: ['me'], createdBy: 'mom' }, 'me')).toBe(true);
    expect(isOwnTask({ assigneeIds: ['dad'], createdBy: 'me' }, 'me')).toBe(false);
    expect(isOwnTask({ assigneeIds: [], createdBy: 'me' }, 'me')).toBe(true);
    expect(isOwnTask({ assigneeIds: [], createdBy: 'mom' }, 'me')).toBe(false);
  });
});

describe('reminderDetail', () => {
  test('gives the moment, with the date only when it is another day', () => {
    const start = new Date('2026-10-24T15:30:00');
    expect(reminderDetail(start, DEFAULT_REMINDER, { kind: 'event', own: true, dateOnly: false, defaults })).toBe('15:15（开始前 15 分钟）');
    expect(reminderDetail(start, { mode: 'before', minutesBefore: 1440 }, { kind: 'task', own: true, dateOnly: false, defaults }))
      .toBe(`10月23日 15:30（提前 1 天）`);
    expect(reminderDetail(new Date('2026-10-24T00:00:00'), DEFAULT_REMINDER, { kind: 'task', own: true, dateOnly: true, defaults })).toBe('09:00（当天）');
    expect(reminderDetail(start, DEFAULT_REMINDER, { kind: 'task', own: false, dateOnly: false, defaults })).toBe('不提醒（默认）');
    expect(reminderDetail(start, { mode: 'off', minutesBefore: null }, { kind: 'event', own: true, dateOnly: false, defaults })).toBe('不提醒');
  });

  test('says when it rings', () => {
    const start = new Date('2026-10-24T15:30:00');
    expect(reminderDetail(start, DEFAULT_REMINDER, { kind: 'event', own: true, dateOnly: false, defaults: { ...defaults, alarm: true } })).toBe('15:15（开始前 15 分钟） · 闹铃');
    expect(reminderDetail(start, { mode: 'before', minutesBefore: 0, alarm: true }, { kind: 'task', own: true, dateOnly: false, defaults })).toBe('15:30（准时） · 闹铃');
    expect(reminderDetail(start, { mode: 'before', minutesBefore: 0, alarm: false }, { kind: 'task', own: true, dateOnly: false, defaults: { ...defaults, alarm: true } })).toBe('15:30（准时）');
  });
});
