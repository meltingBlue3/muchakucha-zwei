import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { ApiClientError, type NoteResponseDto } from '@muchakucha/api-client';
import { sessionApiClient, sessionStateStore, sessionTransport } from '../auth/session-runtime';
import { notifyContentChanged } from '../content/content-changes';
import { isEditConflict } from '../../ui/edit-conflict';
import { useWorkspaceStore } from '../../ui/workspace-state';
import type { ChecklistTick } from './checklists';
import { noteTitle, setChecklistItem } from './markdown';
import type { NoteEditorChange } from './note-editor-dom';

/** How long the writing has to pause before it is saved. */
export const NOTE_SAVE_IDLE_MS = 1000;
/** How often a save that failed for lack of network or a server error is tried again. */
export const NOTE_SAVE_RETRY_MS = 30_000;
/** Ticks merged into someone else's newer version in a row before asking instead. */
const MAX_MERGES = 3;
// The version edit-conflict.tsx records when a draft's own version is unknown: any save of it conflicts.
const UNKNOWN_VERSION = '1970-01-01T00:00:00.000Z';

export interface NoteContent { title: string; body: string }

/**
 * - `idle`: a new note with nothing in it yet
 * - `saving`: a change waits for the pause, or is on its way
 * - `unsaved`: a draft restored from this device, not yet saved
 * - `offline` / `failed`: kept on this device and tried again later
 * - `conflict`, `deleted`, `sessionExpired`: saving waits for the person
 */
export type NoteSaveStatus = 'idle' | 'saved' | 'saving' | 'unsaved' | 'offline' | 'failed' | 'conflict' | 'deleted' | 'sessionExpired';

export interface NoteConflict {
  /** The version someone else saved; null while it could not be read. */
  latest: NoteResponseDto | null;
  /** Save this device's version over theirs. */
  keepMine(): void;
  /** Drop this device's changes and continue from theirs. */
  takeLatest(): void;
}

interface Options {
  householdId: string;
  /** `new` until the first save creates the note. */
  noteId: string;
  /** The note as read when the page opened; null for a new note. */
  note: NoteResponseDto | null;
  /** The first save created the note: the page takes its address. */
  onCreated(note: NoteResponseDto): void;
  /** Put this content in the editor: after a merge, or when the latest version is chosen. */
  onReplace(content: NoteContent): void;
}

interface Payload { title: string | null; body: string }
const payloadOf = (content: NoteContent): Payload => ({ title: noteTitle(content.title, content.body), body: content.body });
const samePayload = (payload: Payload, note: { title: string; body?: string | null }) => payload.title === note.title && payload.body.trim() === (note.body ?? '').trim() && (payload.body.trim() === '' || payload.body === note.body);
const sameContent = (a: NoteContent, b: NoteContent) => a.title === b.title && a.body === b.body;
/**
 * Kept beside a new note's draft while its first save is on its way. A reply
 * lost to a closed tab or a dropped connection leaves it behind, and the next
 * save looks for that note instead of creating a second one.
 */
interface PendingCreate { at: string; title: string }
const isPendingCreate = (value: unknown): value is PendingCreate => typeof value === 'object' && value !== null && typeof (value as PendingCreate).at === 'string' && typeof (value as PendingCreate).title === 'string';
/** How far apart this device's clock and the server's may be when matching a lost create. */
const CREATE_MATCH_MS = 10 * 60_000;
const isDraft = (value: unknown): value is NoteContent => typeof value === 'object' && value !== null && typeof (value as NoteContent).title === 'string' && typeof (value as NoteContent).body === 'string';

/**
 * Saves a note while it is written: after a pause, at once for a tick, and
 * before the page goes away or the app goes to the background. One request
 * runs at a time; changes made meanwhile are sent when it returns. Every
 * change is first kept as a draft on this device, so nothing written is lost
 * to a failed save, and a draft found on opening is restored and saved.
 */
export function useNoteAutosave({ householdId, noteId, note, onCreated, onReplace }: Options) {
  const workspace = useWorkspaceStore();
  const callbacks = useRef({ onCreated, onReplace });
  callbacks.current = { onCreated, onReplace };
  // Everything the save loop reads lives in one place that outlasts renders,
  // so a save started before unmounting still finishes and clears its draft.
  const engine = useRef<ReturnType<typeof createEngine> | null>(null);
  if (engine.current === null) engine.current = createEngine();
  // A new note may still change household before its first save; afterwards it stays.
  if (engine.current.id === null) engine.current.householdId = householdId;

  function createEngine() {
    const self = {
      householdId,
      id: noteId === 'new' ? null as string | null : noteId,
      mounted: true,
      draft: { title: note?.title ?? '', body: note?.body ?? '' } as NoteContent,
      stored: note as NoteResponseDto | null,
      version: note?.updatedAt ?? '',
      ticks: [] as ChecklistTick[],
      edits: 0,
      merges: 0,
      /** An input method is composing; the pause timer waits for it. */
      composing: false,
      paused: null as 'conflict' | 'deleted' | null,
      timer: undefined as ReturnType<typeof setTimeout> | undefined,
      retry: undefined as ReturnType<typeof setInterval> | undefined,
      inFlight: null as Promise<void> | null,
      again: false,
      status: 'idle' as NoteSaveStatus,
      restored: false,
      prefix() { return `draft:${self.householdId}:notes:${self.id ?? 'new'}:`; },
    };
    const prefix = self.prefix();
    const draft: unknown = workspace.get(prefix + 'form');
    if (workspace.hasDrafts(prefix) && isDraft(draft)) {
      self.draft = { title: draft.title, body: draft.body };
      self.restored = true;
      self.edits = 1;
      // The version the draft was written against (edit-conflict.tsx keeps it beside the draft).
      const base: unknown = workspace.get(prefix + 'baseVersion');
      self.version = typeof base === 'string' && base ? base : UNKNOWN_VERSION;
    }
    self.status = self.restored ? 'unsaved' : note ? 'saved' : 'idle';
    return self;
  }
  const e = engine.current;
  const [status, setStatusState] = useState<NoteSaveStatus>(e.status);
  const [saved, setSaved] = useState<NoteResponseDto | null>(note);
  const [conflict, setConflict] = useState<{ latest: NoteResponseDto | null } | null>(null);
  const conflictLatest = useRef<NoteResponseDto | null>(null);
  conflictLatest.current = conflict?.latest ?? null;
  // What the editor opens with, fixed at mount: a restored draft, or the note as read.
  const initial = useRef<NoteContent>({ ...e.draft }).current;

  const setStatus = useCallback((next: NoteSaveStatus) => {
    engine.current!.status = next;
    if (engine.current!.mounted) setStatusState(next);
  }, []);

  const writeDraft = useCallback(() => {
    const self = engine.current!;
    workspace.set(self.prefix() + 'form', self.draft);
    if (self.version) workspace.set(self.prefix() + 'baseVersion', self.version);
  }, [workspace]);

  const settle = useCallback((latest: NoteResponseDto) => {
    const self = engine.current!;
    self.stored = latest;
    self.version = latest.updatedAt;
    if (self.mounted) setSaved(latest);
  }, []);

  const clearDraft = useCallback(() => {
    const self = engine.current!;
    workspace.clear(self.prefix());
    // Bookkeeping only: it is not a change and is not kept without one.
    if (self.version) workspace.set(self.prefix() + 'baseVersion', self.version);
  }, [workspace]);

  const stopRetry = useCallback(() => {
    const self = engine.current!;
    if (self.retry !== undefined) clearInterval(self.retry);
    self.retry = undefined;
  }, []);

  // `save` and the conflict handling refer to each other; the ref breaks the cycle.
  const saveRef = useRef<() => Promise<void>>(async () => {});

  const startRetry = useCallback(() => {
    const self = engine.current!;
    if (self.retry !== undefined || !self.mounted) return;
    self.retry = setInterval(() => { void saveRef.current(); }, NOTE_SAVE_RETRY_MS);
  }, []);

  /** The note an earlier first save created, when its reply never arrived. */
  const findLostCreate = useCallback(async (token: string): Promise<NoteResponseDto | null> => {
    const self = engine.current!;
    const pending: unknown = workspace.get(self.prefix() + 'creating');
    if (!isPendingCreate(pending)) return null;
    const session = sessionStateStore.get();
    const me = session.kind === 'authenticated' ? session.session.currentUser?.id : undefined;
    const at = Date.parse(pending.at);
    const { notes } = await sessionApiClient.listNotes(token, self.householdId);
    return notes.find(candidate => candidate.title === pending.title && (me === undefined || candidate.createdBy === me) && Math.abs(Date.parse(candidate.createdAt) - at) <= CREATE_MATCH_MS) ?? null;
  }, [workspace]);

  const readLatest = useCallback(async (): Promise<NoteResponseDto | null> => {
    const self = engine.current!;
    if (self.id === null) return null;
    try {
      const token = await sessionTransport.getAccessToken();
      return token === null ? null : await sessionApiClient.getNote(token, self.householdId, self.id);
    } catch { return null; }
  }, []);

  /** Someone else saved since this device's version: merge ticks, otherwise ask. */
  const resolveConflict = useCallback(async () => {
    const self = engine.current!;
    const latest = await readLatest();
    // Our own earlier save, for example one still running when the page was reopened.
    if (latest && samePayload(payloadOf(self.draft), latest)) {
      settle(latest);
      self.ticks = []; self.edits = 0; self.merges = 0;
      clearDraft();
      setStatus('saved');
      return;
    }
    if (latest && self.edits === 0 && self.ticks.length > 0 && self.merges < MAX_MERGES) {
      let body: string | null = latest.body ?? '';
      for (const tick of self.ticks) { body = setChecklistItem(body, tick); if (body === null) break; }
      if (body !== null) {
        self.merges++;
        settle(latest);
        self.draft = { title: latest.title, body };
        writeDraft();
        if (self.mounted) callbacks.current.onReplace(self.draft);
        // Save the merged version on top of theirs.
        self.again = true;
        return;
      }
    }
    self.paused = 'conflict';
    if (self.mounted) setConflict({ latest });
    setStatus('conflict');
  }, [readLatest, settle, clearDraft, writeDraft, setStatus]);

  const save = useCallback(async (): Promise<void> => {
    const self = engine.current!;
    if (self.timer !== undefined) clearTimeout(self.timer);
    self.timer = undefined;
    if (self.paused) return;
    if (self.inFlight) { self.again = true; return self.inFlight; }
    const sent = { ...self.draft };
    const payload = payloadOf(sent);
    if (payload.title === null) {
      // Nothing to save: an empty new note leaves no draft behind; an emptied note keeps its draft.
      if (self.id === null) { workspace.clear(self.prefix()); setStatus('idle'); } else setStatus('unsaved');
      return;
    }
    if (self.stored && samePayload(payload, self.stored)) {
      self.ticks = []; self.edits = 0; self.merges = 0;
      clearDraft();
      stopRetry();
      setStatus('saved');
      return;
    }
    const sentTicks = self.ticks.length;
    const sentEdits = self.edits;
    setStatus('saving');
    const run = async () => {
      const token = await sessionTransport.getAccessToken();
      if (token === null) { setStatus('sessionExpired'); return; }
      const title = payload.title!;
      try {
        if (self.id === null) {
          const lost = await findLostCreate(token);
          if (lost) {
            // That note is this one: take it over and write the current text onto it.
            const from = self.prefix();
            self.id = lost.id;
            self.stored = lost;
            self.version = lost.updatedAt;
            workspace.move(from, self.prefix(), (field, value) => field === 'creating' ? undefined : value);
            if (self.mounted) callbacks.current.onCreated(lost);
          } else workspace.set(self.prefix() + 'creating', { at: new Date().toISOString(), title } satisfies PendingCreate);
        }
        const result = self.id === null
          ? await sessionApiClient.createNote(token, self.householdId, payload.body.trim() ? { title, body: payload.body } : { title })
          : self.stored && samePayload(payload, self.stored) ? self.stored
            : await sessionApiClient.updateNote(token, self.householdId, self.id, { title, body: payload.body, expectedUpdatedAt: self.version || UNKNOWN_VERSION });
        if (self.id === null) {
          const from = self.prefix();
          self.id = result.id;
          workspace.move(from, self.prefix(), (field, value) => field === 'creating' ? undefined : value);
          if (self.mounted) callbacks.current.onCreated(result);
        }
        settle(result);
        self.ticks.splice(0, sentTicks);
        self.edits = Math.max(0, self.edits - sentEdits);
        self.merges = 0;
        stopRetry();
        if (sameContent(self.draft, sent)) clearDraft();
        else { writeDraft(); self.again = true; }
        setStatus(self.again ? 'saving' : 'saved');
        notifyContentChanged(self.householdId);
      } catch (error: unknown) {
        if (isEditConflict(error)) { await resolveConflict(); return; }
        if (error instanceof ApiClientError && error.status === 404 && self.id !== null) {
          self.paused = 'deleted';
          setStatus('deleted');
          return;
        }
        if (error instanceof ApiClientError && error.status === 401) { setStatus('sessionExpired'); return; }
        setStatus(error instanceof ApiClientError ? 'failed' : 'offline');
        startRetry();
      }
    };
    self.inFlight = run().finally(() => {
      self.inFlight = null;
      if (self.again && !self.paused) { self.again = false; void saveRef.current(); }
      else self.again = false;
    });
    return self.inFlight;
  }, [workspace, setStatus, clearDraft, stopRetry, settle, writeDraft, resolveConflict, startRetry, findLostCreate]);
  saveRef.current = save;

  const schedule = useCallback((delay: number) => {
    const self = engine.current!;
    if (self.timer !== undefined) clearTimeout(self.timer);
    const fire = () => {
      // While words are being composed, wait for them.
      if (self.composing) { self.timer = setTimeout(fire, delay); return; }
      self.timer = undefined;
      void saveRef.current();
    };
    self.timer = setTimeout(fire, delay);
  }, []);

  /** From the editor: an input method started or stopped composing. */
  const composing = useCallback((active: boolean) => {
    const self = engine.current!;
    self.composing = active;
    if (!active && self.timer !== undefined) schedule(NOTE_SAVE_IDLE_MS);
  }, [schedule]);

  /** Every change from the editor: kept as a draft at once, saved after the pause (a tick right away). */
  const change = useCallback((next: NoteEditorChange) => {
    const self = engine.current!;
    self.draft = { title: next.title, body: next.body };
    writeDraft();
    if (next.kind === 'tick' && next.tick) self.ticks.push(next.tick);
    else self.edits++;
    if (self.paused) return;
    if (self.status !== 'offline' && self.status !== 'failed') setStatus('saving');
    schedule(next.kind === 'tick' ? 0 : NOTE_SAVE_IDLE_MS);
  }, [writeDraft, setStatus, schedule]);

  /** Save now: Ctrl Enter, and before the page closes or switches to another note. */
  const flush = useCallback(() => saveRef.current(), []);

  const keepMine = useCallback(() => {
    void (async () => {
      const self = engine.current!;
      const latest = conflictLatest.current ?? await readLatest();
      if (!latest) { setStatus('offline'); startRetry(); self.paused = null; setConflict(null); return; }
      settle(latest);
      self.paused = null;
      self.ticks = []; self.edits = Math.max(1, self.edits); self.merges = 0;
      setConflict(null);
      writeDraft();
      await saveRef.current();
    })();
  }, [readLatest, settle, setStatus, startRetry, writeDraft]);

  const takeLatest = useCallback(() => {
    const self = engine.current!;
    const latest = conflictLatest.current;
    if (!latest) return;
    settle(latest);
    self.paused = null;
    self.ticks = []; self.edits = 0; self.merges = 0;
    self.draft = { title: latest.title, body: latest.body ?? '' };
    clearDraft();
    setConflict(null);
    callbacks.current.onReplace(self.draft);
    setStatus('saved');
  }, [settle, clearDraft, setStatus]);

  /** After the note was deleted elsewhere: keep what was written as a new note. */
  const saveAsNew = useCallback(async () => {
    const self = engine.current!;
    const from = self.prefix();
    self.id = null;
    self.stored = null;
    self.version = '';
    self.paused = null;
    self.ticks = []; self.edits = 1; self.merges = 0;
    workspace.move(from, self.prefix(), (field, value) => field === 'baseVersion' || field === 'baseRuleVersion' ? undefined : value);
    writeDraft();
    await saveRef.current();
  }, [workspace, writeDraft]);

  useEffect(() => {
    const self = engine.current!;
    self.mounted = true;
    // A restored draft is saved like any change.
    if (self.restored) schedule(NOTE_SAVE_IDLE_MS);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') { if (self.status === 'offline' || self.status === 'failed') void saveRef.current(); }
      else if (self.timer !== undefined || self.status === 'saving') void saveRef.current();
    });
    return () => {
      subscription.remove();
      self.mounted = false;
      stopRetry();
      // Leaving the page saves what is waiting; the draft stays on this device if that fails.
      if (self.timer !== undefined) void saveRef.current();
    };
  }, [schedule, stopRetry]);

  return {
    /** What the editor opens with: a restored draft, or the note as read. Stable for the page's life. */
    initial,
    status,
    /** The latest version known from the server, for who saved it last and when. */
    saved,
    conflict: conflict ? { latest: conflict.latest, keepMine, takeLatest } satisfies NoteConflict : null,
    change,
    composing,
    flush,
    saveAsNew,
    /** What the editor holds now. */
    current: (): NoteContent => ({ ...engine.current!.draft }),
    /** The latest version known from the server right now, after any save that just returned. */
    latest: (): NoteResponseDto | null => engine.current!.stored,
  };
}
