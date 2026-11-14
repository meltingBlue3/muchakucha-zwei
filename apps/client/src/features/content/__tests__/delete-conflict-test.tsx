import type { PropsWithChildren } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiClientError } from '@muchakucha/api-client';
import { DeleteContentScreen } from '../delete-content-screen';
import { MuchakuchaThemeProvider } from '../../../ui/primitives';

const mockApi = { getNote: jest.fn(), getHousehold: jest.fn(), deleteNote: jest.fn() };
const mockClose = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'household-1', noteId: 'note-1' }),
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('../../auth/session-runtime', () => ({
  sessionStateStore: jest.requireActual('../../auth/session-state').createSessionStateStore(),
  sessionTransport: { getAccessToken: () => Promise.resolve('access-token') },
  sessionApiClient: {
    getNote: (...args: unknown[]) => mockApi.getNote(...args),
    getHousehold: (...args: unknown[]) => mockApi.getHousehold(...args),
    deleteNote: (...args: unknown[]) => mockApi.deleteNote(...args),
  },
}));
jest.mock('../../households/household-context', () => ({ useHouseholdContext: () => ({ viewState: 'ready', households: [] }) }));
jest.mock('../../../ui/route-window', () => ({ useRouteWindowClose: () => ({ close: mockClose }) }));
jest.mock('../../../ui/workspace-state', () => ({ useWorkspaceStore: () => ({ clear: jest.fn() }) }));
jest.mock('../../notes/note-window', () => ({ NoteWindow: ({ children }: PropsWithChildren) => children }));
jest.mock('../../tasks/task-window', () => ({ TaskWindow: ({ children }: PropsWithChildren) => children }));
jest.mock('../../events/event-window', () => ({ EventWindow: ({ children }: PropsWithChildren) => children }));

const note = (title: string, updatedAt: string) => ({
  id: 'note-1', householdId: 'household-1', title, body: null, createdBy: 'user-1', createdAt: '2026-11-01T00:00:00Z', updatedAt,
});

test('a delete refused because the note changed shows the latest note and confirms against its version', async () => {
  mockApi.getHousehold.mockResolvedValue({ members: [{ isCurrentUser: true, role: 'MEMBER', userId: 'user-1' }] });
  mockApi.getNote.mockResolvedValueOnce(note('买菜清单', '2026-11-14T01:00:00.000Z'))
    .mockResolvedValueOnce(note('买菜清单（已补充）', '2026-11-14T02:00:00.000Z'));
  mockApi.deleteNote.mockRejectedValueOnce(new ApiClientError(409, { error: { code: 'EDIT_CONFLICT' } }))
    .mockResolvedValueOnce(undefined);
  const view = await render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>
    <MuchakuchaThemeProvider><DeleteContentScreen resource="notes" /></MuchakuchaThemeProvider>
  </SafeAreaProvider>);

  await fireEvent.press(await view.findByRole('button', { name: '确认删除笔记' }));
  expect(await view.findByText('内容刚被修改过，这里已是最新内容。确认仍要删除吗？')).toBeTruthy();
  expect(view.getByText('确定要删除「买菜清单（已补充）」吗？此操作不可撤销。')).toBeTruthy();
  expect(mockApi.deleteNote).toHaveBeenLastCalledWith('access-token', 'household-1', 'note-1', { expectedUpdatedAt: '2026-11-14T01:00:00.000Z' });

  await fireEvent.press(view.getByRole('button', { name: '确认删除笔记' }));
  await waitFor(() => expect(mockClose).toHaveBeenCalled());
  expect(mockApi.deleteNote).toHaveBeenLastCalledWith('access-token', 'household-1', 'note-1', { expectedUpdatedAt: '2026-11-14T02:00:00.000Z' });
});
