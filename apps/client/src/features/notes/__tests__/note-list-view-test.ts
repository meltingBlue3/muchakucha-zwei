import type { LabelResponseDto, NoteResponseDto } from '@muchakucha/api-client';

import { noteListView, type NoteListOptions } from '../note-list-view';

const NOW = new Date('2026-11-25T12:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const label = (id: string, name: string): LabelResponseDto => ({ id, householdId: 'home', name, color: '#2C716C', systemKey: null, localizedNames: null, createdBy: 'me', createdAt: daysAgo(30) });
const school = label('school', '学校');
const shopping = label('shopping', '采购');
const note = (id: string, title: string, patch: Partial<NoteResponseDto> = {}): NoteResponseDto => ({
  id, householdId: 'home', title, body: null, createdBy: 'me', updatedBy: 'me', createdAt: daysAgo(40), updatedAt: daysAgo(1), pinnedAt: null, labels: [], ...patch,
});
const options = (patch: Partial<NoteListOptions> = {}): NoteListOptions => ({ query: '', labelId: null, wide: false, householdLabels: [], now: NOW, ...patch });
const shape = (view: ReturnType<typeof noteListView>) => view.groups.map(group => [group.key, group.items.map(item => item.note.id)]);

describe('noteListView groups', () => {
  const notes = [
    note('fresh', '刚改的', { updatedAt: daysAgo(0) }),
    note('pinned-old', '置顶的旧笔记', { updatedAt: daysAgo(30), pinnedAt: daysAgo(0) }),
    note('week', '六天前', { updatedAt: daysAgo(6) }),
    note('pinned-new', '置顶的新笔记', { updatedAt: daysAgo(2), pinnedAt: daysAgo(10) }),
    note('old', '一个月前', { updatedAt: daysAgo(31) }),
  ];

  test('on a phone pinned notes lead and the rest follow under 其他, each by last change', () => {
    expect(shape(noteListView(notes, options()))).toEqual([
      ['pinned', ['pinned-new', 'pinned-old']],
      ['others', ['fresh', 'week', 'old']],
    ]);
  });

  test('on a wide screen the rest splits into the last 7 days and earlier', () => {
    expect(shape(noteListView(notes, options({ wide: true })))).toEqual([
      ['pinned', ['pinned-new', 'pinned-old']],
      ['recent', ['fresh', 'week']],
      ['older', ['old']],
    ]);
  });

  test('without a pin the list is as before: one unnamed group on a phone', () => {
    const unpinned = notes.filter(item => item.pinnedAt === null);
    expect(shape(noteListView(unpinned, options()))).toEqual([['all', ['fresh', 'week', 'old']]]);
    expect(shape(noteListView(unpinned, options({ wide: true })))).toEqual([['recent', ['fresh', 'week']], ['older', ['old']]]);
  });

  test('empty groups are left out', () => {
    expect(shape(noteListView([notes[1]!], options({ wide: true })))).toEqual([['pinned', ['pinned-old']]]);
    expect(noteListView([], options()).groups).toEqual([]);
  });
});

describe('noteListView labels and filter', () => {
  const notes = [
    note('a', '周末采购', { labels: [shopping], body: '买排骨' }),
    note('b', '开学清单', { labels: [school, shopping], pinnedAt: daysAgo(1) }),
    note('c', '旅行计划', { body: '订酒店，买排骨' }),
  ];

  test('the row lists only labels some note carries, in the household order', () => {
    const unused = label('unused', '没用过');
    expect(noteListView(notes, options({ householdLabels: [school, unused, shopping] })).labels.map(item => item.id)).toEqual(['school', 'shopping']);
    expect(noteListView(notes, options({ householdLabels: [shopping, school] })).labels.map(item => item.id)).toEqual(['shopping', 'school']);
  });

  test('labels the household list does not have follow in the order the notes show them', () => {
    expect(noteListView(notes, options()).labels.map(item => item.id)).toEqual(['shopping', 'school']);
  });

  test('no note with a label means no row', () => {
    expect(noteListView([notes[2]!], options()).labels).toEqual([]);
  });

  test('a chosen label keeps only its notes, pinned ones still first', () => {
    const view = noteListView(notes, options({ labelId: 'shopping' }));
    expect(view.labelId).toBe('shopping');
    expect(shape(view)).toEqual([['pinned', ['b']], ['others', ['a']]]);
    expect(view.shown).toBe(2);
  });

  test('a label no note carries any more falls back to 全部', () => {
    const view = noteListView(notes, options({ labelId: 'gone' }));
    expect(view.labelId).toBeNull();
    expect(view.shown).toBe(3);
  });

  test('the label filter and the search combine', () => {
    const view = noteListView(notes, options({ labelId: 'shopping', query: '排骨' }));
    expect(shape(view)).toEqual([['all', ['a']]]);
    expect(view.groups[0]!.items[0]!.snippet).toEqual({ before: '买', match: '排骨', after: '' });
    const none = noteListView(notes, options({ labelId: 'school', query: '酒店' }));
    expect(none.groups).toEqual([]);
    expect(none.shown).toBe(0);
    // The row still offers every label in use, whatever the search leaves.
    expect(none.labels.map(item => item.id)).toEqual(['shopping', 'school']);
  });

  test('a search alone keeps the grouping of what it finds', () => {
    expect(shape(noteListView(notes, options({ query: '排骨', wide: true })))).toEqual([['recent', ['a', 'c']]]);
  });
});
