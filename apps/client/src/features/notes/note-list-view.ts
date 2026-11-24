import type { LabelResponseDto, NoteResponseDto } from '@muchakucha/api-client';

import { searchNotes, type NoteSearchResult } from './note-search';

/**
 * `pinned` leads whenever a note is pinned. The rest is `recent` and `older`
 * on a wide screen; on a phone it is `others` beside a pinned group, or one
 * unnamed `all` group when nothing is pinned, as before pinning existed.
 */
export type NoteGroupKey = 'pinned' | 'recent' | 'older' | 'others' | 'all';

export interface NoteGroup {
  key: NoteGroupKey;
  items: NoteSearchResult[];
}

export interface NoteListView {
  groups: NoteGroup[];
  /** Labels at least one note carries, in the household's order; no row is shown when empty. */
  labels: LabelResponseDto[];
  /** The label filter in effect: null for 全部, also when the chosen label is on no note any more. */
  labelId: string | null;
  /** Notes left after the label filter and the search. */
  shown: number;
}

export interface NoteListOptions {
  query: string;
  /** The chosen label, or null for 全部. */
  labelId: string | null;
  /** A wide screen splits the unpinned notes by age. */
  wide: boolean;
  /** The household's labels in their order, to order the row; may be empty when they could not be read. */
  householdLabels: readonly LabelResponseDto[];
  now: Date;
}

const RECENT_MS = 7 * 86_400_000;

const byUpdate = (a: NoteSearchResult, b: NoteSearchResult) => Date.parse(b.note.updatedAt) - Date.parse(a.note.updatedAt);

/**
 * What the notes list shows: the label row, then the notes the label filter
 * and the search leave, in groups. Within every group notes are ordered by
 * when they were last changed; a pin never reorders a group, it only lifts the
 * note into the pinned one. The label filter and the search combine.
 */
export function noteListView(notes: readonly NoteResponseDto[], { query, labelId, wide, householdLabels, now }: NoteListOptions): NoteListView {
  const inUse = new Map<string, LabelResponseDto>();
  for (const note of notes) for (const label of note.labels) if (!inUse.has(label.id)) inUse.set(label.id, label);
  // The household's order; a label it does not list (it could not be read) follows in the order the notes show it.
  const position = new Map(householdLabels.map((label, index) => [label.id, index]));
  const seen = [...inUse.keys()];
  const rank = (id: string) => position.get(id) ?? householdLabels.length + seen.indexOf(id);
  const labels = [...inUse.values()].sort((a, b) => rank(a.id) - rank(b.id));

  const activeLabel = labelId !== null && inUse.has(labelId) ? labelId : null;
  const filtered = activeLabel === null ? notes : notes.filter(note => note.labels.some(label => label.id === activeLabel));
  const results = searchNotes(filtered, query).sort(byUpdate);

  const pinned = results.filter(result => result.note.pinnedAt !== null);
  const rest = results.filter(result => result.note.pinnedAt === null);
  const groups: NoteGroup[] = pinned.length > 0 ? [{ key: 'pinned', items: pinned }] : [];
  if (wide) {
    const recent = (result: NoteSearchResult) => now.getTime() - Date.parse(result.note.updatedAt) <= RECENT_MS;
    groups.push({ key: 'recent', items: rest.filter(recent) }, { key: 'older', items: rest.filter(result => !recent(result)) });
  } else {
    groups.push({ key: pinned.length > 0 ? 'others' : 'all', items: rest });
  }

  return { groups: groups.filter(group => group.items.length > 0), labels, labelId: activeLabel, shown: results.length };
}
