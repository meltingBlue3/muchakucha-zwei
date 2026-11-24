import type { NoteResponseDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { notifyContentChanged } from '../content/content-changes';

/**
 * A note's pin and labels. They are not edits of the note: they save on their
 * own, at once, without the note's edit version, and never move it in the list.
 */
export interface NoteMarks {
  pinnedAt: string | null;
  labels: NoteResponseDto['labels'];
}

const listeners = new Set<(note: NoteResponseDto) => void>();

/** Calls `listener` with the note whenever its pin or labels are saved on this device. */
export function subscribeNoteMarks(listener: (note: NoteResponseDto) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

async function saved(write: (token: string) => Promise<NoteResponseDto>): Promise<NoteResponseDto> {
  const token = await sessionTransport.getAccessToken();
  if (token === null) throw new Error('Session expired');
  const note = await write(token);
  listeners.forEach(listener => listener(note));
  // The list follows, wherever the change was made.
  notifyContentChanged(note.householdId);
  return note;
}

/** Pins the note for the whole household, or unpins it; resolves with the note as saved. */
export function saveNotePin(householdId: string, noteId: string, pinned: boolean): Promise<NoteResponseDto> {
  return saved(token => pinned ? sessionApiClient.pinNote(token, householdId, noteId) : sessionApiClient.unpinNote(token, householdId, noteId));
}

/** Replaces the note's labels; resolves with the note as saved. */
export function saveNoteLabels(householdId: string, noteId: string, labelIds: string[]): Promise<NoteResponseDto> {
  return saved(token => sessionApiClient.setNoteLabels(token, householdId, noteId, { labelIds }));
}
