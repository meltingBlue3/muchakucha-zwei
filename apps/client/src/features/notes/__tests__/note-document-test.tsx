import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { LabelListItemDto, NoteResponseDto } from '@muchakucha/api-client';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import NoteRoute from '../../../../app/(protected)/households/[id]/notes/[noteId]/index';
import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { createWorkspaceState, WorkspaceStateProvider } from '../../../ui/workspace-state';
import { householdLabelsCacheKey } from '../../labels/use-household-labels';

const mockGetNote = jest.fn();
const mockGetHousehold = jest.fn();
const mockListLabels = jest.fn();
const mockSetNoteLabels = jest.fn();
const mockState = {
  onReady: null as (() => Promise<void>) | null,
  editorMounts: 0,
  windowMounts: 0,
  windowUnmounts: 0,
};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'home', noteId: 'note-1' }),
  useGlobalSearchParams: () => ({ id: 'home', noteId: 'note-1' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), setParams: jest.fn() }),
  useIsFocused: () => true,
  useRoute: () => ({ key: 'note-route-key', name: 'households/[id]/notes/[noteId]/index' }),
  useNavigation: () => ({
    getState: () => ({
      routes: [
        { key: 'list-key', name: 'households/[id]/notes/index', params: { id: 'home' } },
        { key: 'note-route-key', name: 'households/[id]/notes/[noteId]/index', params: { id: 'home', noteId: 'note-1' } },
      ],
    }),
    setOptions: jest.fn(),
    addListener: () => jest.fn(),
    dispatch: jest.fn(),
  }),
}));

jest.mock('../note-window', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const actual = jest.requireActual<typeof import('../note-window')>('../note-window');
  return {
    ...actual,
    NoteWindow: (props: Parameters<typeof actual.NoteWindow>[0]) => {
      React.useEffect(() => {
        mockState.windowMounts++;
        return () => { mockState.windowUnmounts++; };
      }, []);
      return React.createElement(actual.NoteWindow, props);
    },
  };
});

jest.mock('expo-blur', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View: NativeView } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    BlurTargetView: React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
      React.createElement(NativeView, { ...props, ref, testID: typeof props.testID === 'string' ? props.testID : 'blur-target' } as never),
    ),
    BlurView: (props: Record<string, unknown>) => React.createElement(NativeView, props),
  };
});

jest.mock('../note-editor-dom', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View: NativeView, Text: NativeText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: ({ initialTitle, onReady }: { initialTitle: string; onReady: () => Promise<void> }) => {
      mockState.onReady = onReady;
      React.useEffect(() => { mockState.editorMounts++; }, []);
      return React.createElement(NativeView, { testID: 'mock-note-editor' }, React.createElement(NativeText, null, initialTitle));
    },
  };
});

jest.mock('../../auth/session-runtime', () => ({
  sessionStateStore: jest.requireActual('../../auth/session-state').createSessionStateStore(),
  sessionTransport: { getAccessToken: jest.fn(async () => 'access-token') },
  sessionApiClient: {
    getNote: (...args: unknown[]) => mockGetNote(...args),
    getHousehold: (...args: unknown[]) => mockGetHousehold(...args),
    listLabels: (...args: unknown[]) => mockListLabels(...args),
    setNoteLabels: (...args: unknown[]) => mockSetNoteLabels(...args),
    pinNote: jest.fn(),
    unpinNote: jest.fn(),
  },
}));

jest.mock('../../households/household-context', () => ({
  useHouseholdContext: () => ({
    households: [{ id: 'home', name: '学习', role: 'OWNER' }],
    currentHouseholdId: 'home',
  }),
}));

const sampleLabel = (id: string, name: string): LabelListItemDto => ({
  id, householdId: 'home', name, color: '#4C7537', systemKey: null, localizedNames: null, createdBy: 'user', createdAt: '2026-10-22T00:00:00.000Z', usage: { events: 0, tasks: 0, notes: 0 },
});

const sampleNote = (patch: Partial<NoteResponseDto> = {}): NoteResponseDto => ({
  id: 'note-1',
  householdId: 'home',
  title: 'LangChain & LangGraph',
  body: null,
  createdBy: 'user',
  updatedBy: 'user',
  createdAt: '2026-10-22T08:00:00.000Z',
  updatedAt: '2026-10-22T08:00:00.000Z',
  pinnedAt: null,
  labels: [],
  ...patch,
});

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 44, right: 0, bottom: 34, left: 0 } };

let store: ReturnType<typeof createWorkspaceState>;

beforeEach(() => {
  jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({ width: 390, height: 844, scale: 2, fontScale: 1 });
  store = createWorkspaceState();
  mockState.onReady = null;
  mockState.editorMounts = 0;
  mockState.windowMounts = 0;
  mockState.windowUnmounts = 0;
  mockGetNote.mockReset();
  mockGetHousehold.mockReset();
  mockListLabels.mockReset();
  mockSetNoteLabels.mockReset();
  mockGetHousehold.mockResolvedValue({ id: 'home', name: '学习', members: [{ userId: 'user', displayName: 'kuroko' }] });
});

afterEach(() => {
  jest.restoreAllMocks();
});

function renderNoteRoute() {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <WorkspaceStateProvider store={store}>
        <MuchakuchaThemeProvider>
          <NoteRoute />
        </MuchakuchaThemeProvider>
      </WorkspaceStateProvider>
    </SafeAreaProvider>,
  );
}

test('keeps one NoteWindow mounted across loading and waits for the native editor before showing chrome', async () => {
  let resolveNote!: (note: NoteResponseDto) => void;
  mockGetNote.mockReturnValue(new Promise<NoteResponseDto>(resolve => { resolveNote = resolve; }));

  const view = await renderNoteRoute();
  expect(mockState.windowMounts).toBe(1);
  expect(mockState.windowUnmounts).toBe(0);
  expect(view.getByLabelText('正在加载笔记')).toBeTruthy();
  expect(view.queryByRole('button', { name: '标签' })).toBeNull();

  await act(async () => { resolveNote(sampleNote()); });

  // Same NoteWindow stays mounted: no close/reopen modal flash between loading and loaded.
  expect(mockState.windowMounts).toBe(1);
  expect(mockState.windowUnmounts).toBe(0);
  expect(mockState.editorMounts).toBe(1);
  // Before the native WebView reports onReady, the loading indicator stays over the editor and chrome waits.
  expect(view.getByLabelText('正在加载笔记')).toBeTruthy();
  expect(view.queryByRole('button', { name: '标签' })).toBeNull();

  await act(async () => { await mockState.onReady?.(); });

  expect(mockState.windowMounts).toBe(1);
  expect(mockState.windowUnmounts).toBe(0);
  expect(view.queryByLabelText('正在加载笔记')).toBeNull();
  expect(view.getByRole('button', { name: '标签' })).toBeTruthy();
  expect(view.getByText('LangChain & LangGraph')).toBeTruthy();
});

test('disables 完成 while labels are loading or failed so existing labels cannot be wiped', async () => {
  const existing = sampleLabel('health', '健康');
  mockGetNote.mockResolvedValue(sampleNote({ labels: [existing] }));
  let rejectLabels!: (error: Error) => void;
  mockListLabels.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectLabels = reject; }));

  const view = await renderNoteRoute();
  await waitFor(() => expect(mockState.onReady).not.toBeNull());
  await act(async () => { await mockState.onReady?.(); });

  await fireEvent.press(view.getByRole('button', { name: '标签' }));
  expect(view.getByText('加载标签中…')).toBeTruthy();
  const done = view.getByRole('button', { name: '完成' });
  expect(done.props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(done);
  expect(mockSetNoteLabels).not.toHaveBeenCalled();

  await act(async () => { rejectLabels(new Error('offline')); });
  expect(await view.findByText('标签没有加载成功。')).toBeTruthy();
  expect(view.getByRole('button', { name: '完成' }).props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(view.getByRole('button', { name: '完成' }));
  expect(mockSetNoteLabels).not.toHaveBeenCalled();
});

test('opening 标签 on a phone shows cached labels immediately and keeps the editor visible behind the blurred sheet', async () => {
  const health = sampleLabel('health', '健康');
  store.set(householdLabelsCacheKey('home'), [health]);
  mockGetNote.mockResolvedValue(sampleNote());
  mockListLabels.mockReturnValue(new Promise(() => {}));

  const view = await renderNoteRoute();
  await waitFor(() => expect(mockState.onReady).not.toBeNull());
  await act(async () => { await mockState.onReady?.(); });

  await fireEvent.press(view.getByRole('button', { name: '标签' }));

  // Cached labels render at once with 完成 ready, no loading jump.
  expect(view.queryByText('加载标签中…')).toBeNull();
  expect(view.getByLabelText('选择标签 健康')).toBeTruthy();
  expect(view.getByRole('button', { name: '完成' }).props.accessibilityState.disabled).toBe(false);

  // The editor stays mounted and visible (never display: 'none') so Android WebView does not flash blank on return,
  // while its sheet layer is marked aria-hidden so assistive tech focuses only on 标签.
  expect(view.queryByTestId('mock-note-editor')).toBeNull();
  const editorNode = view.getByTestId('mock-note-editor', { includeHiddenElements: true });
  let cursor = editorNode.parent;
  while (cursor) {
    const flat = StyleSheet.flatten(cursor.props?.style);
    expect(flat?.display).not.toBe('none');
    cursor = cursor.parent;
  }

  // The foreground blur targets the sheet's own BlurTargetView rather than the notes list behind it.
  const blur = view.getByTestId('app-dialog-blur');
  expect(blur.props.blurTarget?.current).toBeTruthy();
  expect(mockState.editorMounts).toBe(1);
});
