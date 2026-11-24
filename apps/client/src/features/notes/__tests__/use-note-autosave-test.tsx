import type { PropsWithChildren } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { ApiClientError, type NoteResponseDto } from '@muchakucha/api-client';
import { createWorkspaceState, WorkspaceStateProvider } from '../../../ui/workspace-state';
import { NOTE_SAVE_IDLE_MS, NOTE_SAVE_RETRY_MS, useNoteAutosave } from '../use-note-autosave';
import type { NoteEditorChange } from '../note-editor-dom';

const mockApi = { createNote: jest.fn(), updateNote: jest.fn(), getNote: jest.fn(), listNotes: jest.fn() };
jest.mock('../../auth/session-runtime', () => ({
  sessionTransport: { getAccessToken: () => 'access-token' },
  sessionStateStore: { get: () => ({ kind: 'authenticated', session: { currentUser: { id: 'me' } } }) },
  sessionApiClient: {
    listNotes: (...args: unknown[]) => mockApi.listNotes(...args),
    createNote: (...args: unknown[]) => mockApi.createNote(...args),
    updateNote: (...args: unknown[]) => mockApi.updateNote(...args),
    getNote: (...args: unknown[]) => mockApi.getNote(...args),
  },
}));
jest.mock('../../content/content-changes', () => ({ notifyContentChanged: jest.fn() }));

const T0 = '2026-11-24T08:00:00.000Z';
const T1 = '2026-11-24T08:01:00.000Z';
const T2 = '2026-11-24T08:02:00.000Z';
const groceries = '- [ ] 牛奶\n- [ ] 鸡蛋';
const note = (patch: Partial<NoteResponseDto> = {}): NoteResponseDto => ({
  id: 'note-1', householdId: 'home', title: '采购', body: groceries, createdBy: 'me', updatedBy: 'me', createdAt: T0, updatedAt: T0, pinnedAt: null, labels: [], ...patch,
});
const edit = (body: string, title = '采购'): NoteEditorChange => ({ title, body, kind: 'edit' });
const tick = (index: number, text: string, checked: boolean, body: string): NoteEditorChange => ({ title: '采购', body, kind: 'tick', tick: { index, text, checked } });
const conflict = () => new ApiClientError(409, { error: { code: 'EDIT_CONFLICT' } });

let store: ReturnType<typeof createWorkspaceState>;
let changeAppState: ((state: AppStateStatus) => void) | undefined;

async function open(options: { noteId?: string; note?: NoteResponseDto | null } = {}) {
  const onCreated = jest.fn();
  const onReplace = jest.fn();
  const wrapper = ({ children }: PropsWithChildren) => <WorkspaceStateProvider store={store}>{children}</WorkspaceStateProvider>;
  const opened = options.note === undefined ? note() : options.note;
  const hook = await renderHook((props: { noteId: string }) => useNoteAutosave({ householdId: 'home', noteId: props.noteId, note: opened, onCreated, onReplace }), {
    wrapper, initialProps: { noteId: options.noteId ?? 'note-1' },
  });
  return { ...hook, onCreated, onReplace };
}
const wait = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });
const draftOf = (id = 'note-1') => store.get(`draft:home:notes:${id}:form`);

beforeEach(() => {
  jest.useFakeTimers();
  store = createWorkspaceState();
  mockApi.createNote.mockReset();
  mockApi.updateNote.mockReset();
  mockApi.getNote.mockReset();
  mockApi.listNotes.mockReset();
  mockApi.updateNote.mockImplementation(async (_token: string, _household: string, id: string, input: { title: string; body: string }) => note({ id, title: input.title, body: input.body, updatedAt: T1 }));
  changeAppState = undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    changeAppState = listener as (state: AppStateStatus) => void;
    return { remove: jest.fn() };
  });
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test('opening a note saves nothing', async () => {
  const { result } = await open();
  await wait(NOTE_SAVE_RETRY_MS);
  expect(mockApi.updateNote).not.toHaveBeenCalled();
  expect(result.current.status).toBe('saved');
  expect(store.hasDrafts()).toBe(false);
});

test('a pause of one second saves once, with the version the note was opened at', async () => {
  const { result } = await open();
  await act(() => result.current.change(edit(`${groceries}\n- [ ] 面包`)));
  expect(draftOf()).toEqual({ title: '采购', body: `${groceries}\n- [ ] 面包` });
  await wait(NOTE_SAVE_IDLE_MS - 1);
  expect(mockApi.updateNote).not.toHaveBeenCalled();
  expect(result.current.status).toBe('saving');
  await wait(1);
  expect(mockApi.updateNote).toHaveBeenCalledTimes(1);
  expect(mockApi.updateNote).toHaveBeenCalledWith('access-token', 'home', 'note-1', { title: '采购', body: `${groceries}\n- [ ] 面包`, expectedUpdatedAt: T0 });
  expect(result.current.status).toBe('saved');
  expect(result.current.saved?.updatedAt).toBe(T1);
  expect(store.hasDrafts()).toBe(false);
});

test('continuous typing saves only the last version', async () => {
  const { result } = await open();
  for (const body of ['牛', '牛奶', '牛奶两', '牛奶两盒']) {
    await act(() => result.current.change(edit(body)));
    await wait(NOTE_SAVE_IDLE_MS / 2);
  }
  expect(mockApi.updateNote).not.toHaveBeenCalled();
  await wait(NOTE_SAVE_IDLE_MS);
  expect(mockApi.updateNote).toHaveBeenCalledTimes(1);
  expect(mockApi.updateNote.mock.calls[0][3]).toMatchObject({ body: '牛奶两盒' });
});

test('a tick saves at once', async () => {
  const { result } = await open();
  await act(() => result.current.change(tick(0, '牛奶', true, '- [x] 牛奶\n- [ ] 鸡蛋')));
  await wait(0);
  expect(mockApi.updateNote).toHaveBeenCalledTimes(1);
  expect(mockApi.updateNote.mock.calls[0][3]).toMatchObject({ body: '- [x] 牛奶\n- [ ] 鸡蛋' });
});

test('a tick that meets someone else\'s save is merged into their version without asking', async () => {
  const theirs = note({ body: '- [ ] 牛奶\n- [ ] 鸡蛋\n- [ ] 面包', updatedBy: 'dad', updatedAt: T1 });
  mockApi.updateNote.mockRejectedValueOnce(conflict());
  mockApi.getNote.mockResolvedValue(theirs);
  const { result, onReplace } = await open();
  await act(() => result.current.change(tick(1, '鸡蛋', true, '- [ ] 牛奶\n- [x] 鸡蛋')));
  await wait(0);
  const merged = '- [ ] 牛奶\n- [x] 鸡蛋\n- [ ] 面包';
  expect(onReplace).toHaveBeenCalledWith({ title: '采购', body: merged });
  expect(mockApi.updateNote).toHaveBeenCalledTimes(2);
  expect(mockApi.updateNote.mock.calls[1][3]).toEqual({ title: '采购', body: merged, expectedUpdatedAt: T1 });
  expect(result.current.status).toBe('saved');
  expect(result.current.conflict).toBeNull();
});

test('a text change that meets someone else\'s save pauses saving and asks', async () => {
  const theirs = note({ body: '- [ ] 牛奶\n- [ ] 面包', updatedBy: 'dad', updatedAt: T1 });
  mockApi.updateNote.mockRejectedValueOnce(conflict());
  mockApi.getNote.mockResolvedValue(theirs);
  const { result, onReplace } = await open();
  await act(() => result.current.change(edit('- [ ] 牛奶两盒\n- [ ] 鸡蛋')));
  await wait(NOTE_SAVE_IDLE_MS);
  expect(result.current.status).toBe('conflict');
  expect(result.current.conflict?.latest).toEqual(theirs);
  expect(onReplace).not.toHaveBeenCalled();
  // Writing goes on into the draft, but nothing is sent while it waits.
  await act(() => result.current.change(edit('- [ ] 牛奶两盒\n- [ ] 鸡蛋一盒')));
  await wait(NOTE_SAVE_RETRY_MS);
  expect(mockApi.updateNote).toHaveBeenCalledTimes(1);
  expect(draftOf()).toEqual({ title: '采购', body: '- [ ] 牛奶两盒\n- [ ] 鸡蛋一盒' });

  await act(async () => { result.current.conflict!.keepMine(); await jest.advanceTimersByTimeAsync(0); });
  expect(mockApi.updateNote).toHaveBeenCalledTimes(2);
  expect(mockApi.updateNote.mock.calls[1][3]).toEqual({ title: '采购', body: '- [ ] 牛奶两盒\n- [ ] 鸡蛋一盒', expectedUpdatedAt: T1 });
  expect(result.current.status).toBe('saved');
});

test('choosing the latest version drops this device\'s changes', async () => {
  const theirs = note({ body: '- [ ] 面包', updatedBy: 'dad', updatedAt: T1 });
  mockApi.updateNote.mockRejectedValueOnce(conflict());
  mockApi.getNote.mockResolvedValue(theirs);
  const { result, onReplace } = await open();
  await act(() => result.current.change(edit('我的改动')));
  await wait(NOTE_SAVE_IDLE_MS);
  await act(() => result.current.conflict!.takeLatest());
  expect(onReplace).toHaveBeenCalledWith({ title: '采购', body: '- [ ] 面包' });
  expect(result.current.status).toBe('saved');
  expect(store.hasDrafts()).toBe(false);
  expect(mockApi.updateNote).toHaveBeenCalledTimes(1);
});

test('offline, the draft stays on the device and is saved when the network is back', async () => {
  mockApi.updateNote.mockRejectedValueOnce(new TypeError('Network request failed'));
  const { result } = await open();
  await act(() => result.current.change(edit('离线时写的')));
  await wait(NOTE_SAVE_IDLE_MS);
  expect(result.current.status).toBe('offline');
  expect(draftOf()).toEqual({ title: '采购', body: '离线时写的' });
  expect(store.get('draft:home:notes:note-1:baseVersion')).toBe(T0);

  await wait(NOTE_SAVE_RETRY_MS);
  expect(mockApi.updateNote).toHaveBeenCalledTimes(2);
  expect(result.current.status).toBe('saved');
  expect(store.hasDrafts()).toBe(false);
});

test('returning to the app retries a save that failed', async () => {
  mockApi.updateNote.mockRejectedValueOnce(new ApiClientError(503, {}));
  const { result } = await open();
  await act(() => result.current.change(edit('服务器出错时写的')));
  await wait(NOTE_SAVE_IDLE_MS);
  expect(result.current.status).toBe('failed');
  await act(async () => { changeAppState?.('active'); await jest.advanceTimersByTimeAsync(0); });
  expect(mockApi.updateNote).toHaveBeenCalledTimes(2);
  expect(result.current.status).toBe('saved');
});

test('going to the background saves what is waiting', async () => {
  const { result } = await open();
  await act(() => result.current.change(edit('切到后台前写的')));
  await act(async () => { changeAppState?.('background'); await jest.advanceTimersByTimeAsync(0); });
  expect(mockApi.updateNote).toHaveBeenCalledTimes(1);
});

test('a draft found on opening is restored, shown as unsaved and saved against its own version', async () => {
  store.set('draft:home:notes:note-1:form', { title: '采购', body: '上次没存上的' });
  store.set('draft:home:notes:note-1:baseVersion', T0);
  const { result } = await open({ note: note({ updatedAt: T0 }) });
  expect(result.current.initial).toEqual({ title: '采购', body: '上次没存上的' });
  expect(result.current.status).toBe('unsaved');
  await wait(NOTE_SAVE_IDLE_MS);
  expect(mockApi.updateNote.mock.calls[0][3]).toEqual({ title: '采购', body: '上次没存上的', expectedUpdatedAt: T0 });
});

test('a new note is created by its first save and updated after that', async () => {
  mockApi.createNote.mockResolvedValue(note({ id: 'created', title: '周末', body: '- [ ] 买菜', updatedAt: T1 }));
  const { result, onCreated, rerender } = await open({ noteId: 'new', note: null });
  expect(result.current.status).toBe('idle');
  await act(() => result.current.change(edit('- [ ] 买菜', '周末')));
  await wait(NOTE_SAVE_IDLE_MS);
  expect(mockApi.createNote).toHaveBeenCalledWith('access-token', 'home', { title: '周末', body: '- [ ] 买菜' });
  expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'created' }));
  expect(store.hasDrafts()).toBe(false);
  await rerender({ noteId: 'created' });

  await act(() => result.current.change(edit('- [ ] 买菜\n- [ ] 洗车', '周末')));
  await wait(NOTE_SAVE_IDLE_MS);
  expect(mockApi.createNote).toHaveBeenCalledTimes(1);
  expect(mockApi.updateNote).toHaveBeenCalledWith('access-token', 'home', 'created', { title: '周末', body: '- [ ] 买菜\n- [ ] 洗车', expectedUpdatedAt: T1 });
});

test('a note without a title takes its first line of text', async () => {
  mockApi.createNote.mockResolvedValue(note({ id: 'created', title: '牛奶', updatedAt: T1 }));
  const { result } = await open({ noteId: 'new', note: null });
  await act(() => result.current.change(edit('- [ ] **牛奶**\n- [ ] 鸡蛋', '')));
  await wait(NOTE_SAVE_IDLE_MS);
  expect(mockApi.createNote.mock.calls[0][2]).toEqual({ title: '牛奶', body: '- [ ] **牛奶**\n- [ ] 鸡蛋' });
});

test('nothing is saved while both the title and the body are empty', async () => {
  const { result } = await open({ noteId: 'new', note: null });
  await act(() => result.current.change(edit('  \n', ' ')));
  await wait(NOTE_SAVE_RETRY_MS);
  expect(mockApi.createNote).not.toHaveBeenCalled();
  expect(result.current.status).toBe('idle');
  expect(store.hasDrafts()).toBe(false);
});

test('changes made while a save is on its way are sent when it returns', async () => {
  let answer: (value: NoteResponseDto) => void = () => {};
  mockApi.updateNote.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
  const { result } = await open();
  await act(() => result.current.change(edit('第一版')));
  await wait(NOTE_SAVE_IDLE_MS);
  await act(() => result.current.change(edit('第二版')));
  await wait(NOTE_SAVE_IDLE_MS);
  // Still one request: the second waits for the first.
  expect(mockApi.updateNote).toHaveBeenCalledTimes(1);
  await act(async () => { answer(note({ body: '第一版', updatedAt: T1 })); await jest.advanceTimersByTimeAsync(0); });
  expect(mockApi.updateNote).toHaveBeenCalledTimes(2);
  expect(mockApi.updateNote.mock.calls[1][3]).toEqual({ title: '采购', body: '第二版', expectedUpdatedAt: T1 });
  expect(result.current.status).toBe('saved');
});

test('a note deleted elsewhere can be kept as a new note', async () => {
  mockApi.updateNote.mockRejectedValueOnce(new ApiClientError(404, { error: { code: 'NOTE_NOT_FOUND' } }));
  mockApi.createNote.mockResolvedValue(note({ id: 'again', body: '还想留着', updatedAt: T2 }));
  const { result, onCreated } = await open();
  await act(() => result.current.change(edit('还想留着')));
  await wait(NOTE_SAVE_IDLE_MS);
  expect(result.current.status).toBe('deleted');
  await act(async () => { await result.current.saveAsNew(); });
  expect(mockApi.createNote).toHaveBeenCalledWith('access-token', 'home', { title: '采购', body: '还想留着' });
  expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'again' }));
  expect(result.current.status).toBe('saved');
});

test('leaving the page saves what is waiting', async () => {
  const { result, unmount } = await open();
  await act(() => result.current.change(edit('关窗前写的')));
  await act(async () => { unmount(); await jest.advanceTimersByTimeAsync(0); });
  expect(mockApi.updateNote).toHaveBeenCalledTimes(1);
  expect(store.hasDrafts()).toBe(false);
});

test('a pause while an input method is composing waits for the chosen words', async () => {
  const { result } = await open();
  await act(() => result.current.change(edit('- [ ] 牛奶\n- [ ] ')));
  await act(() => result.current.composing(true));
  await wait(NOTE_SAVE_IDLE_MS * 3);
  expect(mockApi.updateNote).not.toHaveBeenCalled();
  await act(() => { result.current.change(edit('- [ ] 牛奶\n- [ ] 两个')); result.current.composing(false); });
  await wait(NOTE_SAVE_IDLE_MS);
  expect(mockApi.updateNote).toHaveBeenCalledTimes(1);
  expect(mockApi.updateNote.mock.calls[0][3]).toMatchObject({ body: '- [ ] 牛奶\n- [ ] 两个' });
});

test('a first save whose reply was lost is found again instead of creating a second note', async () => {
  mockApi.createNote.mockImplementationOnce(async () => { throw new TypeError('Network request failed'); });
  const first = await open({ noteId: 'new', note: null });
  await act(() => first.result.current.change(edit('- [ ] 买菜', '周末')));
  await wait(NOTE_SAVE_IDLE_MS);
  expect(first.result.current.status).toBe('offline');
  expect(store.get('draft:home:notes:new:creating')).toMatchObject({ title: '周末' });
  await first.unmount();

  // The server had created it after all; the reopened draft finds that note and writes onto it.
  const created = note({ id: 'arrived', title: '周末', body: '- [ ] 买菜', createdAt: new Date().toISOString(), updatedAt: T1 });
  mockApi.listNotes.mockResolvedValue({ notes: [note({ id: 'other', title: '周末', createdBy: 'someone-else' }), created], total: 2 });
  const again = await open({ noteId: 'new', note: null });
  await act(() => again.result.current.change(edit('- [ ] 买菜\n- [ ] 洗车', '周末')));
  await wait(NOTE_SAVE_IDLE_MS);
  expect(mockApi.createNote).toHaveBeenCalledTimes(1);
  expect(again.onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'arrived' }));
  expect(mockApi.updateNote).toHaveBeenCalledWith('access-token', 'home', 'arrived', { title: '周末', body: '- [ ] 买菜\n- [ ] 洗车', expectedUpdatedAt: T1 });
  expect(again.result.current.status).toBe('saved');
  expect(store.hasDrafts()).toBe(false);
});

test('emptying the body sends it empty, so the stored body is cleared', async () => {
  const { result } = await open();
  await act(() => result.current.change(edit('')));
  await wait(NOTE_SAVE_IDLE_MS);
  expect(mockApi.updateNote.mock.calls[0][3]).toEqual({ title: '采购', body: '', expectedUpdatedAt: T0 });
});
