import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { NoteResponseDto } from '@muchakucha/api-client';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import NotesListRoute from '../../../../app/(protected)/households/[id]/notes/index';
import { searchNotesByTitle } from '../note-search';
import { MuchakuchaThemeProvider } from '../../../ui/primitives';

const mockListNotes = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'household-1' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(effect, [effect]);
  },
}));

jest.mock('../../auth/session-runtime', () => ({
  sessionApiClient: { listNotes: (...args: unknown[]) => mockListNotes(...args) },
  sessionTransport: { getAccessToken: () => Promise.resolve('access-token') },
}));

jest.mock('../../households/household-context', () => ({
  useHouseholdContext: () => ({
    viewState: 'ready',
    households: [{ id: 'household-1', name: '家', role: 'OWNER', memberCount: 2, ownerMembershipId: 'membership-1' }],
    currentHouseholdId: 'household-1',
    accessChangedHouseholdName: undefined,
    refreshHouseholds: jest.fn(),
    switchHousehold: jest.fn(),
    enterAccessChanged: jest.fn(),
    resolve: jest.fn(),
  }),
}));

function note(id: string, title: string): NoteResponseDto {
  const now = new Date().toISOString();
  return { id, householdId: 'household-1', title, body: null, createdBy: 'user', createdAt: now, updatedAt: now };
}

async function renderNotes(notes: NoteResponseDto[]) {
  mockListNotes.mockResolvedValue({ notes, total: notes.length });
  const view = render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>
      <MuchakuchaThemeProvider>
        <NotesListRoute />
      </MuchakuchaThemeProvider>
    </SafeAreaProvider>,
  );
  await waitFor(() => expect(mockListNotes).toHaveBeenCalled());
  return view;
}

beforeEach(() => {
  mockListNotes.mockReset();
});

describe('searchNotesByTitle', () => {
  const notes = [note('1', '采购清单'), note('2', '旅行计划'), note('3', 'Wi-Fi 密码')];

  test('matches a substring of the title', () => {
    expect(searchNotesByTitle(notes, '清单').map((n) => n.id)).toEqual(['1']);
  });

  test('ignores case so a Latin title matches either way', () => {
    expect(searchNotesByTitle(notes, 'wi-fi').map((n) => n.id)).toEqual(['3']);
    expect(searchNotesByTitle(notes, 'WI-FI').map((n) => n.id)).toEqual(['3']);
  });

  test('a blank or whitespace-only query returns every note', () => {
    expect(searchNotesByTitle(notes, '')).toHaveLength(3);
    expect(searchNotesByTitle(notes, '   ')).toHaveLength(3);
  });

  test('surrounding whitespace in the query is ignored', () => {
    expect(searchNotesByTitle(notes, '  旅行  ').map((n) => n.id)).toEqual(['2']);
  });

  test('matches a title composed in a different Unicode form', () => {
    // 'é' as e + combining acute, searched for as the precomposed character.
    const decomposed = [note('4', 'café 计划')];
    expect(searchNotesByTitle(decomposed, 'café').map((n) => n.id)).toEqual(['4']);
  });

  test('no match yields an empty list rather than everything', () => {
    expect(searchNotesByTitle(notes, '不存在的标题')).toEqual([]);
  });

  test('does not search the body, which the card cannot show a match in', () => {
    const withBody: NoteResponseDto[] = [{ ...note('5', '标题'), body: '正文里有钥匙' }];
    expect(searchNotesByTitle(withBody, '钥匙')).toEqual([]);
  });

  test('leaves the given list untouched', () => {
    const original = [...notes];
    searchNotesByTitle(notes, '清单');
    expect(notes).toEqual(original);
  });
});

describe('notes screen search', () => {
  test('filters the visible notes as the query is typed', async () => {
    const { getByPlaceholderText, queryByLabelText } = await renderNotes([
      note('1', '采购清单'),
      note('2', '旅行计划'),
    ]);

    await waitFor(() => expect(queryByLabelText('笔记：采购清单')).not.toBeNull());
    expect(queryByLabelText('笔记：旅行计划')).not.toBeNull();

    fireEvent.changeText(getByPlaceholderText('按标题搜索'), '旅行');

    await waitFor(() => expect(queryByLabelText('笔记：采购清单')).toBeNull());
    expect(queryByLabelText('笔记：旅行计划')).not.toBeNull();
  });

  test('a query matching nothing explains itself and offers to clear', async () => {
    const { getByLabelText, getByPlaceholderText, queryByLabelText, queryByText } = await renderNotes([note('1', '采购清单')]);

    await waitFor(() => expect(queryByLabelText('笔记：采购清单')).not.toBeNull());
    fireEvent.changeText(getByPlaceholderText('按标题搜索'), '找不到的');

    await waitFor(() => expect(queryByText(/没有标题匹配/)).not.toBeNull());
    // The no-result state must not be confused with having no notes at all.
    expect(queryByText(/还没有笔记/)).toBeNull();

    fireEvent.press(getByLabelText('清除搜索'));
    await waitFor(() => expect(queryByLabelText('笔记：采购清单')).not.toBeNull());
  });

  test('an empty household gets no search box and is told what notes are for', async () => {
    const { queryByLabelText, queryByPlaceholderText, queryByText } = await renderNotes([]);

    await waitFor(() => expect(queryByText(/还没有笔记/)).not.toBeNull());
    expect(queryByText(/采购清单、旅行计划、家电说明/)).not.toBeNull();
    expect(queryByLabelText('创建第一篇笔记')).not.toBeNull();
    // Nothing to search through, so the field would only be noise.
    expect(queryByPlaceholderText('按标题搜索')).toBeNull();
  });
});
