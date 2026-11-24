import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { NoteResponseDto } from '@muchakucha/api-client';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import NotesListRoute from '../../../../app/(protected)/households/[id]/notes/index';
import { MuchakuchaThemeProvider } from '../../../ui/primitives';
import { searchNotes } from '../note-search';

const mockListNotes = jest.fn();
const mockPinNote = jest.fn();
const mockGetHousehold = jest.fn();

jest.mock('expo-router', () => ({ usePathname: () => '/',
  useLocalSearchParams: () => ({ id: 'household-1' }),
  useGlobalSearchParams: () => ({ id: 'household-1' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(effect, [effect]);
  },
}));

jest.mock('../../auth/session-runtime', () => ({
  sessionStateStore: jest.requireActual('../../auth/session-state').createSessionStateStore(),
  sessionApiClient: {
    listNotes: (...args: unknown[]) => mockListNotes(...args),
    pinNote: (...args: unknown[]) => mockPinNote(...args),
    getHousehold: (...args: unknown[]) => mockGetHousehold(...args),
    listLabels: () => Promise.resolve({ labels: [], total: 0 }),
  },
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
    rememberHousehold: jest.fn(),
    enterAccessChanged: jest.fn(),
    resolve: jest.fn(),
  }),
}));

function note(id: string, title: string, patch: Partial<NoteResponseDto> = {}): NoteResponseDto {
  const now = new Date().toISOString();
  return { id, householdId: 'household-1', title, body: null, createdBy: 'user', updatedBy: 'user', createdAt: now, updatedAt: now, pinnedAt: null, labels: [], ...patch };
}

const shopping = { id: 'label-shopping', householdId: 'household-1', name: '采购', color: '#C98A1B', systemKey: null, localizedNames: null, createdBy: 'user', createdAt: '2026-11-01T00:00:00.000Z' };

async function renderNotes(notes: NoteResponseDto[]) {
  mockListNotes.mockResolvedValue({ notes, total: notes.length });
  const view = await render(
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
  mockPinNote.mockReset();
  mockGetHousehold.mockReset();
  mockGetHousehold.mockResolvedValue({ id: 'household-1', name: '家', members: [{ userId: 'user', displayName: '小林' }] });
});

describe('searchNotes', () => {
  const body = '周六上午去菜场，买排骨两斤、西红柿六个和一盒鸡蛋，下午顺路去超市补充牛奶、面包和洗衣液，晚上回家。';
  const notes = [note('1', '周末采购', { body }), note('2', '旅行计划', { body: '订酒店' }), note('3', 'Wi-Fi 密码', { body: '贴在冰箱上' })];
  const snippetOf = (query: string, list = notes) => searchNotes(list, query).map(result => result.snippet);

  test('finds a word in the body as the note reads, not in its Markdown', () => {
    const marked = [note('4', '清单', { body: '- [ ] **排骨** 两斤\n- [x] [超市](https://example.com) 牛奶' })];
    expect(searchNotes(marked, '排骨两斤').map(result => result.note.id)).toEqual(['4']);
    expect(searchNotes(marked, 'example')).toEqual([]);
    expect(searchNotes(marked, '[x]')).toEqual([]);
  });

  test('a match near the start keeps everything before it and fills the rest', () => {
    expect(snippetOf('菜场')[0]).toEqual({ before: '周六上午去', match: '菜场', after: '，买排骨两斤、西红柿六个和一盒鸡蛋，下午顺路去超市补充牛奶、面包和…' });
  });

  test('a match in the middle keeps about twelve characters before it', () => {
    expect(snippetOf('超市')[0]).toEqual({ before: '…个和一盒鸡蛋，下午顺路去', match: '超市', after: '补充牛奶、面包和洗衣液，晚上回家。' });
  });

  test('a match at the end has little or nothing after it', () => {
    expect(snippetOf('回家')[0]).toEqual({ before: '…牛奶、面包和洗衣液，晚上', match: '回家', after: '。' });
  });

  test('a match only in the title shows the row as usual', () => {
    expect(searchNotes(notes, '周末')).toEqual([{ note: notes[0], snippet: null }]);
  });

  test('words may be split between title and body, and the body word is shown', () => {
    expect(searchNotes(notes, '密码 冰箱')).toEqual([{ note: notes[2], snippet: { before: '贴在', match: '冰箱', after: '上' } }]);
  });

  test('the match is cut out as written, whatever form was typed', () => {
    expect(snippetOf('ｷﾞｭｳﾆｭｳ', [note('5', '買い物', { body: '帰りにぎゅうにゅうを買う' })])[0]?.match).toBe('ぎゅうにゅう');
  });

  test('a blank query returns every note in order without snippets', () => {
    expect(searchNotes(notes, '  ').map(result => [result.note.id, result.snippet])).toEqual([['1', null], ['2', null], ['3', null]]);
  });

  test('no match yields nothing', () => {
    expect(searchNotes(notes, '不存在的词')).toEqual([]);
  });
});

describe('notes screen', () => {
  test('filters the visible notes as the query is typed', async () => {
    const { getByPlaceholderText, queryByLabelText } = await renderNotes([
      note('1', '采购清单'),
      note('2', '旅行计划'),
    ]);

    await waitFor(() => expect(queryByLabelText('笔记：采购清单')).not.toBeNull());
    expect(queryByLabelText('笔记：旅行计划')).not.toBeNull();

    await fireEvent.changeText(getByPlaceholderText('搜索标题和正文'), '旅行');

    await waitFor(() => expect(queryByLabelText('笔记：采购清单')).toBeNull());
    expect(queryByLabelText('笔记：旅行计划')).not.toBeNull();
  });

  test('a query matching nothing explains itself and offers to clear', async () => {
    const { getByLabelText, getByPlaceholderText, queryByLabelText, queryByText } = await renderNotes([note('1', '采购清单')]);

    await waitFor(() => expect(queryByLabelText('笔记：采购清单')).not.toBeNull());
    await fireEvent.changeText(getByPlaceholderText('搜索标题和正文'), '找不到的');

    await waitFor(() => expect(queryByText('没有笔记匹配「找不到的」。')).not.toBeNull());
    // The no-result state must not be confused with having no notes at all.
    expect(queryByText(/还没有笔记/)).toBeNull();

    await fireEvent.press(getByLabelText('清除搜索'));
    await waitFor(() => expect(queryByLabelText('笔记：采购清单')).not.toBeNull());
  });

  test('a body match shows where it matched in the row', async () => {
    const { getByPlaceholderText, findByTestId, findByLabelText, queryByTestId } = await renderNotes([note('1', '周末采购', { body: '去菜场买排骨' })]);

    await findByLabelText('笔记：周末采购');
    expect(queryByTestId('note-snippet')).toBeNull();
    await fireEvent.changeText(getByPlaceholderText('搜索标题和正文'), '排骨');

    expect(await findByTestId('note-snippet')).toHaveTextContent('去菜场买排骨');
  });

  test('pinned notes come first under 置顶, the rest under 其他, and rows say what they hold', async () => {
    const view = await renderNotes([
      note('1', '旅行计划', { createdBy: 'gone' }),
      note('2', '周末采购', { pinnedAt: new Date().toISOString(), labels: [shopping], body: '- [x] 排骨\n- [ ] 鸡蛋\n- [ ] 牛奶' }),
    ]);

    await view.findByLabelText('笔记：周末采购，已置顶，清单 1/3，采购');
    expect(view.getByText('置顶')).toBeTruthy();
    expect(view.getByText('其他')).toBeTruthy();
    // The pinned group is above the rest.
    const rows = view.getAllByRole('button').map(button => String(button.props.accessibilityLabel ?? '')).filter(name => name.startsWith('笔记：'));
    expect(rows).toEqual(['笔记：周末采购，已置顶，清单 1/3，采购', '笔记：旅行计划']);
    expect(await view.findByText(/已离开的成员/)).toBeTruthy();
    expect(view.getByText(/1\/3/)).toBeTruthy();
    expect(view.getByText(/小林/)).toBeTruthy();
  });

  test('without a pin there are no group names, as before', async () => {
    const view = await renderNotes([note('1', '旅行计划'), note('2', '周末采购')]);

    await view.findByLabelText('笔记：旅行计划');
    expect(view.queryByText('置顶')).toBeNull();
    expect(view.queryByText('其他')).toBeNull();
  });

  test('the label row lists labels in use and filters to one', async () => {
    const view = await renderNotes([note('1', '周末采购', { labels: [shopping] }), note('2', '旅行计划')]);

    expect(await view.findByRole('radio', { name: '全部', checked: true })).toBeTruthy();
    expect(view.getByLabelText('按标签筛选').props.accessibilityRole).toBe('radiogroup');
    await fireEvent.press(view.getByRole('radio', { name: '采购' }));

    await waitFor(() => expect(view.queryByLabelText('笔记：旅行计划')).toBeNull());
    expect(view.getByLabelText('笔记：周末采购，采购')).toBeTruthy();
    expect(view.getByRole('radio', { name: '采购', checked: true })).toBeTruthy();
  });

  test('no label row when no note carries a label', async () => {
    const view = await renderNotes([note('1', '旅行计划')]);

    await view.findByLabelText('笔记：旅行计划');
    expect(view.queryByLabelText('按标签筛选')).toBeNull();
    expect(view.queryByRole('radio', { name: '全部' })).toBeNull();
  });

  test('a search with a label chosen explains both and clears both', async () => {
    const view = await renderNotes([note('1', '周末采购', { labels: [shopping] }), note('2', '旅行计划')]);

    await fireEvent.press(await view.findByRole('radio', { name: '采购' }));
    await fireEvent.changeText(view.getByPlaceholderText('搜索标题和正文'), '旅行');

    expect(await view.findByText('「采购」标签下没有笔记匹配「旅行」。')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: '清除搜索和筛选' }));
    await waitFor(() => expect(view.getByLabelText('笔记：旅行计划')).toBeTruthy());
    expect(view.getByRole('radio', { name: '全部', checked: true })).toBeTruthy();
  });

  test('the row menu pins a note and the list follows', async () => {
    const view = await renderNotes([note('1', '旅行计划'), note('2', '周末采购')]);
    const pinnedAt = new Date().toISOString();
    mockPinNote.mockResolvedValue(note('2', '周末采购', { pinnedAt }));

    await fireEvent.press(await view.findByLabelText('更多操作：笔记：周末采购'));
    mockListNotes.mockResolvedValue({ notes: [note('1', '旅行计划'), note('2', '周末采购', { pinnedAt })], total: 2 });
    await fireEvent.press(view.getByRole('menuitem', { name: '置顶笔记：周末采购' }));

    await waitFor(() => expect(mockPinNote).toHaveBeenCalledWith('access-token', 'household-1', '2'));
    expect(await view.findByLabelText('笔记：周末采购，已置顶')).toBeTruthy();
    expect(view.getByText('置顶')).toBeTruthy();
  });

  test('a pin that does not save says so and leaves the list as it was', async () => {
    const view = await renderNotes([note('1', '旅行计划')]);
    mockPinNote.mockRejectedValue(new Error('offline'));

    await fireEvent.press(await view.findByLabelText('更多操作：笔记：旅行计划'));
    await fireEvent.press(view.getByRole('menuitem', { name: '置顶笔记：旅行计划' }));

    expect(await view.findByText('置顶没有保存，请检查网络后重试。')).toBeTruthy();
    expect(view.getByLabelText('笔记：旅行计划')).toBeTruthy();
    expect(view.queryByText('置顶')).toBeNull();
  });

  test('an empty household gets no search box and is told what notes are for', async () => {
    const { queryByLabelText, queryByPlaceholderText, queryByText } = await renderNotes([]);

    await waitFor(() => expect(queryByText(/还没有笔记/)).not.toBeNull());
    expect(queryByText(/采购清单、旅行计划、家电说明/)).not.toBeNull();
    expect(queryByLabelText('创建笔记')).not.toBeNull();
    // Nothing to search through, so the field would only be noise.
    expect(queryByPlaceholderText('搜索标题和正文')).toBeNull();
  });
});
