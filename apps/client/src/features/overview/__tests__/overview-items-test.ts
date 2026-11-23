import { householdClashes, isMineOrUnassigned, overviewTasks } from '../overview-items';
import { carryToHousehold } from '../household-target-field';
import { householdMarks, overviewHouseholds } from '../../households/household-marks';
import { householdMarkColors } from '../../../ui/theme';

jest.mock('expo-router', () => ({ useRouter: () => ({ setParams: jest.fn() }) }));

const task = (id: string, assigneeIds: string[], status = 'pending') => ({ id, assigneeIds, status });

describe('the 总览 keeps to the person’s own work', () => {
  test('a task is theirs when it is assigned to them or to nobody', () => {
    expect(isMineOrUnassigned({ assigneeIds: [] }, 'me')).toBe(true);
    expect(isMineOrUnassigned({ assigneeIds: ['dad', 'me'] }, 'me')).toBe(true);
    expect(isMineOrUnassigned({ assigneeIds: ['dad'] }, 'me')).toBe(false);
  });

  test('counts only the open tasks it leaves out, and shows all on request', () => {
    const tasks = [task('mine', ['me']), task('free', []), task('dad', ['dad']), task('dadDone', ['dad'], 'completed'), task('mumCancelled', ['mum'], 'cancelled'), task('mum', ['mum'], 'in_progress')];
    const mine = overviewTasks(tasks, 'me', false);
    expect(mine.shown.map(t => t.id)).toEqual(['mine', 'free']);
    expect(mine.othersOpen).toBe(2);
    const all = overviewTasks(tasks, 'me', true);
    expect(all.shown).toHaveLength(tasks.length);
    expect(all.othersOpen).toBe(0);
  });

  test('without a known person it hides nothing rather than everything', () => {
    expect(overviewTasks([task('dad', ['dad'])], null, false).shown).toHaveLength(1);
  });
});

describe('clashes between households', () => {
  const event = (id: string, householdId: string, start: string, end: string, allDay = false) => ({ id, householdId, startTime: `2026-11-23T${start}:00.000Z`, endTime: `2026-11-23T${end}:00.000Z`, allDay });

  test('marks the later of two overlapping events from different households', () => {
    const checkup = event('checkup', 'parents', '02:00', '03:30');
    const meeting = event('meeting', 'home', '03:00', '04:00');
    const clashes = householdClashes([meeting, checkup]);
    expect(clashes.get('meeting')?.id).toBe('checkup');
    expect(clashes.has('checkup')).toBe(false);
  });

  test('leaves alone events of one household, touching ends and all-day events', () => {
    expect(householdClashes([event('a', 'home', '02:00', '03:00'), event('b', 'home', '02:30', '03:30')]).size).toBe(0);
    expect(householdClashes([event('a', 'home', '02:00', '03:00'), event('b', 'parents', '03:00', '04:00')]).size).toBe(0);
    expect(householdClashes([event('a', 'home', '00:00', '23:59', true), event('b', 'parents', '03:00', '04:00')]).size).toBe(0);
  });
});

describe('household marks', () => {
  const household = (id: string, name: string, joinedAt: string, inOverview = true) => ({ id, name, joinedAt, inOverview });

  test('take the first character and give colors in the order the person joined', () => {
    const marks = householdMarks([household('b', '爸妈家', '2026-02-01'), household('a', '我们家', '2026-01-01')]);
    expect(marks.get('a')).toEqual({ character: '我', color: householdMarkColors[0], name: '我们家' });
    expect(marks.get('b')?.color).toBe(householdMarkColors[1]);
  });

  test('keep a household’s color when another is joined later', () => {
    const before = householdMarks([household('a', '我们家', '2026-01-01'), household('b', '爸妈家', '2026-02-01')]);
    const after = householdMarks([household('c', '外婆家', '2026-03-01'), household('a', '我们家', '2026-01-01'), household('b', '爸妈家', '2026-02-01')]);
    expect(after.get('a')?.color).toBe(before.get('a')?.color);
    expect(after.get('b')?.color).toBe(before.get('b')?.color);
  });

  test('the 总览 lists only the chosen households, in mark order', () => {
    const list = overviewHouseholds([household('c', '外婆家', '2026-03-01', false), household('b', '爸妈家', '2026-02-01'), household('a', '我们家', '2026-01-01')]);
    expect(list.map(h => h.id)).toEqual(['a', 'b']);
  });
});

describe('moving a new item to another household', () => {
  test('keeps what the person wrote and drops the old household’s assignees and labels', () => {
    expect(carryToHousehold('labels', ['label-1'])).toBeUndefined();
    expect(carryToHousehold('form', { title: '买水果', assigneeIds: ['dad'] })).toEqual({ title: '买水果', assigneeIds: [] });
    expect(carryToHousehold('form', { title: '家长会' })).toEqual({ title: '家长会' });
    expect(carryToHousehold('form:reminder', 'default')).toBe('default');
  });
});
