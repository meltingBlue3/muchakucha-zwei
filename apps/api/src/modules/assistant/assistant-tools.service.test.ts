import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, test, vi } from 'vitest';
import type { EventsService } from '../events/events.service.js';
import type { TasksService } from '../tasks/tasks.service.js';
import type { NotesService } from '../notes/notes.service.js';
import type { LabelsService } from '../labels/labels.service.js';
import type { HouseholdsService } from '../households/households.service.js';
import { AssistantToolsService } from './assistant-tools.service.js';
import type { AssistantToolCall } from './assistant.types.js';

const actor = { userId: '10000000-0000-4000-8000-000000000001', householdId: '20000000-0000-4000-8000-000000000001', timeZone: 'Asia/Shanghai' };
const recordId = '30000000-0000-4000-8000-000000000001';
const otherUserId = '10000000-0000-4000-8000-000000000002';
const version = '2026-10-04T10:00:00.000Z';
const note = { id: recordId, householdId: actor.householdId, title: '购物计划', body: '买苹果', createdBy: actor.userId, createdAt: version, updatedAt: version };
const event = {
  ...note, description: '晚饭', startTime: '2026-10-04T12:00:00.000Z', endTime: '2026-10-04T13:00:00.000Z',
  allDay: false, location: null, recurrenceRuleId: null, occurrenceDate: null, cancelledAt: null, recurrence: null, labels: [],
};
const task = {
  ...note, description: '洗碗', status: 'pending' as const, priority: 'medium' as const, assigneeIds: [], dueDate: null,
  recurrenceRuleId: null, occurrenceDate: null, recurrence: null, labels: [],
};
const label = { id: recordId, householdId: actor.householdId, name: '家务', color: '#EF4444', createdBy: actor.userId, createdAt: version };

function fixtures(role: 'OWNER' | 'ADMIN' | 'MEMBER' = 'OWNER') {
  const events = {
    list: vi.fn<EventsService['list']>().mockResolvedValue({ events: [event], total: 1, materializedThrough: null }),
    getById: vi.fn<EventsService['getById']>().mockResolvedValue(event),
    create: vi.fn<EventsService['create']>().mockResolvedValue(event),
    update: vi.fn<EventsService['update']>().mockResolvedValue(event),
    delete: vi.fn<EventsService['delete']>().mockResolvedValue(undefined),
  };
  const tasks = {
    list: vi.fn<TasksService['list']>().mockResolvedValue({ tasks: [task], total: 1, materializedThrough: null }),
    getById: vi.fn<TasksService['getById']>().mockResolvedValue(task),
    create: vi.fn<TasksService['create']>().mockResolvedValue(task),
    update: vi.fn<TasksService['update']>().mockResolvedValue(task),
    delete: vi.fn<TasksService['delete']>().mockResolvedValue(undefined),
  };
  const notes = {
    list: vi.fn<NotesService['list']>().mockResolvedValue({ notes: [note], total: 1 }),
    getById: vi.fn<NotesService['getById']>().mockResolvedValue(note),
    create: vi.fn<NotesService['create']>().mockResolvedValue(note),
    update: vi.fn<NotesService['update']>().mockResolvedValue(note),
    delete: vi.fn<NotesService['delete']>().mockResolvedValue(undefined),
  };
  const labels = {
    list: vi.fn<LabelsService['list']>().mockResolvedValue({ labels: [label], total: 1 }),
    create: vi.fn<LabelsService['create']>().mockResolvedValue(label),
    update: vi.fn<LabelsService['update']>().mockResolvedValue(label),
    delete: vi.fn<LabelsService['delete']>().mockResolvedValue(undefined),
  };
  const households = {
    getHousehold: vi.fn<HouseholdsService['getHousehold']>().mockResolvedValue({
      id: actor.householdId, name: '家庭', ownerMembershipId: recordId, createdAt: version,
      members: [{ membershipId: recordId, userId: actor.userId, displayName: '小明', username: 'xiaoming', role, isCurrentUser: true }],
    }),
  };
  const tools = new AssistantToolsService(
    events as unknown as EventsService, tasks as unknown as TasksService,
    notes as unknown as NotesService, labels as unknown as LabelsService,
    households as unknown as HouseholdsService,
  );
  return { tools, events, tasks, notes, labels, households };
}

const call = (name: string, args: Record<string, unknown> = {}): AssistantToolCall => ({ id: 'call-1', name, arguments: args });

describe('assistant tool boundary', () => {
  test('only registered tools run and tool definitions cannot be mutated by consumers', async () => {
    const { tools, notes } = fixtures();
    await expect(tools.execute(actor, call('run_sql', { query: 'delete from notes' }))).rejects.toMatchObject({
      response: { code: 'ASSISTANT_TOOL_NOT_FOUND' },
    });
    expect(notes.list).not.toHaveBeenCalled();
    const definitions = tools.definitions();
    expect(definitions).toHaveLength(21);
    expect(definitions.filter(tool => tool.mutates)).toHaveLength(12);
    definitions[0]!.name = 'changed';
    expect(tools.definitions()[0]!.name).toBe('list_events');
  });

  test.each(['householdId', 'actorId', 'userId', 'createdBy', '__proto__'])('rejects model-supplied scope or unknown property %s', async key => {
    const { tools, notes } = fixtures();
    const args = JSON.parse(`{"title":"计划","${key}":"foreign"}`) as Record<string, unknown>;
    await expect(tools.execute(actor, call('create_note', args))).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });
    expect(notes.create).not.toHaveBeenCalled();
  });

  test.each([
    ['create_note', { title: null }],
    ['update_note', { id: recordId, expectedUpdatedAt: version, title: null }],
    ['update_task', { id: recordId, expectedUpdatedAt: version, assigneeIds: null }],
    ['create_task', { title: '每周任务', recurrence: { freq: 'weekly', startsOn: '2026-10-04', timezone: 'Asia/Shanghai', count: null } }],
    ['list_tasks', { limit: '10' }],
    ['get_note', { id: '123' }],
    ['list_events', { startDate: '2026-02-30' }],
    ['create_event', { title: '午饭', startTime: '2026-10-04T12:00:00', endTime: '2026-10-04T13:00:00Z' }],
  ])('rejects null traps and invalid parameter types for %s', async (name, args) => {
    const { tools } = fixtures();
    await expect(tools.execute(actor, call(name as string, args as Record<string, unknown>))).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });
  });

  test('rejects unknown nested recurrence properties and unsupported series updates', async () => {
    const { tools, events, tasks } = fixtures();
    await expect(tools.execute(actor, call('create_task', {
      title: '计划', recurrence: { freq: 'weekly', startsOn: '2026-10-04', timezone: 'Asia/Shanghai', householdId: actor.householdId },
    }))).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });
    await expect(tools.execute(actor, call('update_event', {
      id: recordId, expectedUpdatedAt: version, recurrence: { freq: 'daily' },
    }))).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });
    expect(tasks.create).not.toHaveBeenCalled();
    expect(events.update).not.toHaveBeenCalled();
  });

  test('preparing a valid write never mutates data and execution binds the authenticated scope', async () => {
    const { tools, notes } = fixtures();
    const request = call('create_note', { title: '新笔记', body: '写作' });
    await tools.prepare(actor, request);
    expect(notes.create).not.toHaveBeenCalled();
    await tools.execute(actor, request);
    expect(notes.create).toHaveBeenCalledWith(actor.userId, actor.householdId, expect.objectContaining({ title: '新笔记', body: '写作' }));
  });

  test('propagates membership and business-service authorization failures', async () => {
    const { tools, notes } = fixtures();
    const hidden = new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'hidden' });
    notes.list.mockRejectedValue(hidden);
    await expect(tools.execute(actor, call('list_notes'))).rejects.toBe(hidden);
    const forbidden = new ForbiddenException({ code: 'FORBIDDEN', message: 'denied' });
    notes.update.mockRejectedValue(forbidden);
    await expect(tools.execute(actor, call('update_note', { id: recordId, expectedUpdatedAt: version, title: '修改' }))).rejects.toBe(forbidden);
  });

  test('members retain shared-edit permission but cannot delete another member’s content', async () => {
    const { tools, notes } = fixtures('MEMBER');
    notes.getById.mockResolvedValue({ ...note, createdBy: otherUserId });
    await tools.execute(actor, call('update_note', { id: recordId, expectedUpdatedAt: version, title: '共同编辑' }));
    expect(notes.update).toHaveBeenCalledOnce();
    await expect(tools.prepare(actor, call('delete_note', { id: recordId, expectedUpdatedAt: version }))).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    expect(notes.delete).not.toHaveBeenCalled();
  });

  test('members cannot propose managing labels', async () => {
    const { tools, labels } = fixtures('MEMBER');
    await expect(tools.prepare(actor, call('create_label', { name: '新标签', color: '#EF4444' }))).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    expect(labels.create).not.toHaveBeenCalled();
  });

  test('rechecks versions at execution and passes the confirmed version into atomic deletes', async () => {
    const { tools, notes } = fixtures();
    const request = call('delete_note', { id: recordId, expectedUpdatedAt: version });
    await tools.prepare(actor, request);
    notes.getById.mockResolvedValueOnce({ ...note, updatedAt: '2026-10-04T10:01:00.000Z' });
    await expect(tools.execute(actor, request)).rejects.toMatchObject({ response: { code: 'EDIT_CONFLICT' } });
    expect(notes.delete).not.toHaveBeenCalled();
    await tools.execute(actor, request);
    expect(notes.delete).toHaveBeenCalledWith(actor.userId, actor.householdId, recordId, { expectedUpdatedAt: version });
  });

  test('a version conflict detected by the atomic delete is never swallowed', async () => {
    const { tools, notes } = fixtures();
    const conflict = new ConflictException({ code: 'EDIT_CONFLICT', message: 'raced' });
    notes.delete.mockRejectedValue(conflict);
    await expect(tools.execute(actor, call('delete_note', { id: recordId, expectedUpdatedAt: version }))).rejects.toBe(conflict);
  });

  test('requires the recurrence rule version when changing one recurring occurrence', async () => {
    const { tools, tasks } = fixtures();
    tasks.getById.mockResolvedValue({
      ...task, recurrenceRuleId: recordId, occurrenceDate: '2026-10-04',
      recurrence: {
        id: recordId, updatedAt: version, freq: 'daily', interval: 1, byWeekday: [], startsOn: '2026-10-04',
        endsOn: null, count: null, timezone: 'Asia/Shanghai', materializedThrough: null, startTimeLocal: null, durationMinutes: null,
      },
    });
    await expect(tools.prepare(actor, call('delete_task', { id: recordId, expectedUpdatedAt: version }))).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });
    await tools.execute(actor, call('delete_task', { id: recordId, expectedUpdatedAt: version, expectedRuleUpdatedAt: version }));
    expect(tasks.delete).toHaveBeenCalledWith(actor.userId, actor.householdId, recordId, { expectedUpdatedAt: version, expectedRuleUpdatedAt: version });
  });

  test('label snapshots are checked before proposals and forwarded to the atomic mutation', async () => {
    const { tools, labels } = fixtures();
    await expect(tools.prepare(actor, call('delete_label', { id: recordId, expectedName: '旧标签', expectedColor: '#EF4444' }))).rejects.toMatchObject({ response: { code: 'EDIT_CONFLICT' } });
    await tools.execute(actor, call('update_label', { id: recordId, expectedName: label.name, expectedColor: label.color, name: '家庭事务' }));
    expect(labels.update).toHaveBeenCalledWith(actor.userId, actor.householdId, recordId, expect.objectContaining({ name: '家庭事务' }), { name: label.name, color: label.color });
  });

  test('updates reject an empty change and allow explicit clear operations', async () => {
    const { tools, notes } = fixtures();
    await expect(tools.prepare(actor, call('update_note', { id: recordId, expectedUpdatedAt: version }))).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });
    await tools.execute(actor, call('update_note', { id: recordId, expectedUpdatedAt: version, body: '' }));
    expect(notes.update).toHaveBeenCalledWith(actor.userId, actor.householdId, recordId, expect.objectContaining({ body: '' }));
  });

  test('bounded pagination searches full text and tells the model when records or content are omitted', async () => {
    const { tools, notes } = fixtures();
    const longBody = 'x'.repeat(1500) + '苹果';
    notes.list.mockResolvedValue({ notes: [note, { ...note, id: '30000000-0000-4000-8000-000000000002', body: longBody }, { ...note, title: '不匹配', body: '香蕉' }], total: 3 });
    const first = await tools.execute(actor, call('list_notes', { query: '苹果', limit: 1 }));
    expect(first).toMatchObject({ total: 2, offset: 0, returned: 1, nextOffset: 1, truncated: true });
    const second = await tools.execute(actor, call('list_notes', { query: '苹果', limit: 1, offset: 1 }));
    expect(second).toMatchObject({ total: 2, returned: 1, nextOffset: null, truncated: true, items: [{ body: 'x'.repeat(1000), truncatedFields: ['body'] }] });
    await expect(tools.execute(actor, call('list_notes', { limit: 51 }))).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });
  });

  test('a multi-word search needs every word, in any order', async () => {
    const { tools, notes } = fixtures();
    notes.list.mockResolvedValue({ notes: [{ ...note, title: '采购清单（周末）', body: '' }, { ...note, title: '周末出游', body: '' }], total: 2 });
    await expect(tools.execute(actor, call('list_notes', { query: '周末  采购' }))).resolves.toMatchObject({ total: 1, items: [{ title: '采购清单（周末）' }] });
  });

  test('all chunks of a long note are accessible and include the original edit version', async () => {
    const { tools, notes } = fixtures();
    notes.getById.mockResolvedValue({ ...note, body: 'abcdefgh' });
    await expect(tools.execute(actor, call('get_note', { id: recordId, contentLimit: 5 }))).resolves.toMatchObject({
      body: 'abcde', updatedAt: version, contentLength: 8, contentTruncated: true, nextContentOffset: 5,
    });
    await expect(tools.execute(actor, call('get_note', { id: recordId, contentLimit: 5, contentOffset: 5 }))).resolves.toMatchObject({
      body: 'fgh', updatedAt: version, nextContentOffset: null,
    });
  });

  test('event reads never request materialization and disclose recurrence coverage', async () => {
    const { tools, events } = fixtures();
    await expect(tools.execute(actor, call('list_events', { startDate: '2026-10-04', endDate: '2026-10-10', recurring: true }))).resolves.toMatchObject({ recurringCoverage: 'materialized_occurrences_only', materializedThrough: null });
    expect(events.list).toHaveBeenCalledWith(actor.userId, actor.householdId, { startDate: '2026-10-03', endDate: '2026-10-11', recurring: 'true' });
  });

  test('event date bounds are local days in the conversation time zone', async () => {
    const { tools, events } = fixtures();
    const at = (title: string, startTime: string, endTime: string) => ({ ...event, title, startTime, endTime });
    events.list.mockResolvedValue({ events: [
      at('previous-evening', '2026-10-06T12:00:00.000Z', '2026-10-06T13:00:00.000Z'), // 10-06 20:00 local
      at('early-morning', '2026-10-06T23:00:00.000Z', '2026-10-07T00:00:00.000Z'), // 10-07 07:00 local, 10-06 in UTC
      at('late-night', '2026-10-07T15:30:00.000Z', '2026-10-07T16:30:00.000Z'), // 10-07 23:30 local, runs into 10-08
      at('next-day', '2026-10-07T16:00:00.000Z', '2026-10-07T17:00:00.000Z'), // 10-08 00:00 local
    ], total: 4, materializedThrough: null });
    await expect(tools.execute(actor, call('list_events', { startDate: '2026-10-07', endDate: '2026-10-07' }))).resolves.toMatchObject({
      total: 2, timeZone: 'Asia/Shanghai', items: [
        { title: 'early-morning', startLocal: '2026-10-07 周三 07:00', endLocal: '2026-10-07 周三 08:00' },
        { title: 'late-night', startLocal: '2026-10-07 周三 23:30', endLocal: '2026-10-08 周四 00:30' },
      ],
    });
  });

  test('task due-date filtering uses local dates, excludes undated tasks and keeps service-provided filters', async () => {
    const { tools, tasks } = fixtures();
    tasks.list.mockResolvedValue({ tasks: [
      task,
      { ...task, title: 'utc-same-day', dueDate: '2026-10-05T12:00:00.000Z' }, // 10-05 20:00 local
      { ...task, title: 'local-next-day', dueDate: '2026-10-06T23:00:00.000Z' }, // 10-07 07:00 local, 10-06 in UTC
      { ...task, title: 'local-midnight', dueDate: '2026-10-05T16:00:00.000Z' }, // 10-06 without a time
    ], total: 4, materializedThrough: '2026-10-10' });
    await expect(tools.execute(actor, call('list_tasks', { status: 'pending', dueFrom: '2026-10-06', dueThrough: '2026-10-07' }))).resolves.toMatchObject({
      total: 2, materializedThrough: '2026-10-10',
      items: [{ title: 'local-next-day', dueLocal: '2026-10-07 周三 07:00' }, { title: 'local-midnight', dueLocal: '2026-10-06 周二' }],
    });
    expect(tasks.list).toHaveBeenCalledWith(actor.userId, actor.householdId, expect.objectContaining({ status: 'pending' }));
  });

  test('a date-only due date is proposed and written as local midnight', async () => {
    const { tools, tasks } = fixtures();
    const request = call('create_task', { title: '交水费', dueDate: '2026-10-07' });
    await expect(tools.prepare(actor, request)).resolves.toMatchObject({ arguments: { title: '交水费', dueDate: '2026-10-06T16:00:00.000Z' } });
    await tools.execute(actor, request);
    expect(tasks.create).toHaveBeenCalledWith(actor.userId, actor.householdId, expect.objectContaining({ dueDate: '2026-10-06T16:00:00.000Z' }));
    await expect(tools.prepare(actor, call('create_task', { title: '交水费', dueDate: '2026-02-30' }))).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });
  });

  test('all-day events cover whole local days and read a midnight end as exclusive', async () => {
    const { tools, events } = fixtures();
    const prepared = await tools.prepare(actor, call('create_event', {
      title: '秋游', allDay: true, startTime: '2026-10-07T00:00:00+08:00', endTime: '2026-10-09T00:00:00+08:00',
    }));
    expect(prepared.arguments).toMatchObject({ startTime: '2026-10-06T16:00:00.000Z', endTime: '2026-10-08T15:59:59.000Z' });
    await tools.execute(actor, prepared);
    expect(events.create).toHaveBeenCalledWith(actor.userId, actor.householdId, expect.objectContaining({ startTime: '2026-10-06T16:00:00.000Z', endTime: '2026-10-08T15:59:59.000Z' }));
  });
});
