import type { ComponentType, PropsWithChildren } from 'react';
import { act, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import TaskListScreen from '../../tasks/task-list-screen';
import NotesListScreen from '../../notes/note-list-screen';
import CalendarScreen from '../../events/calendar-screen';
import RecurrenceListScreen from '../../recurrence/recurrence-list-screen';
import LabelsScreen from '../../../../app/(protected)/households/[id]/labels';
import { MuchakuchaThemeProvider } from '../../../ui/primitives';

let mockHouseholdId = 'household-1';
const mockLists = {
  tasks: jest.fn(), notes: jest.fn(), events: jest.fn(), rules: jest.fn(), labels: jest.fn(),
};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: mockHouseholdId }),
  useGlobalSearchParams: () => ({}),
  useRouter: () => ({ push: jest.fn() }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(effect, [effect]);
  },
}));
jest.mock('../../auth/session-runtime', () => ({
  sessionStateStore: jest.requireActual('../../auth/session-state').createSessionStateStore(),
  sessionTransport: { getAccessToken: () => Promise.resolve('access-token') },
  sessionApiClient: {
    listTasks: (...args: unknown[]) => mockLists.tasks(...args),
    listNotes: (...args: unknown[]) => mockLists.notes(...args),
    listEvents: (...args: unknown[]) => mockLists.events(...args),
    listRecurrenceRules: (...args: unknown[]) => mockLists.rules(...args),
    listLabels: (...args: unknown[]) => mockLists.labels(...args),
    getHousehold: () => Promise.resolve({ members: [] }),
  },
}));
jest.mock('../../households/household-context', () => ({
  useHouseholdContext: () => ({
    viewState: 'ready', currentHouseholdId: mockHouseholdId, households: [],
  }),
}));
jest.mock('../../households/household-screen', () => ({
  HouseholdScreen: ({ children }: PropsWithChildren) => children,
}));

function tree(Screen: ComponentType) {
  return <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>
    <MuchakuchaThemeProvider><Screen /></MuchakuchaThemeProvider>
  </SafeAreaProvider>;
}

function item(title: string) {
  return {
    id: title, title, name: title, householdId: mockHouseholdId,
    createdBy: 'user-1', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
    status: 'pending', priority: 'medium', dueDate: null, assigneeIds: [], labels: [], body: null, color: '#B94736',
    kind: 'task', freq: 'daily', interval: 1, byWeekday: [], startsOn: '2026-10-01',
    endsOn: null, count: null, timezone: 'Asia/Shanghai', startTimeLocal: null,
    durationMinutes: null, nextOccurrenceDate: '2026-10-11',
  };
}

beforeEach(() => {
  mockHouseholdId = 'household-1';
  for (const [key, mock] of Object.entries(mockLists)) mock.mockReset().mockResolvedValue({ [key]: [] });
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-10T23:59:30'));
});
afterEach(() => jest.useRealTimers());

test('task date groups move at midnight while the list remains mounted', async () => {
  mockLists.tasks.mockResolvedValue({ tasks: [
    { ...item('昨天任务'), dueDate: new Date('2026-10-10T12:00:00').toISOString() },
    { ...item('今天任务'), dueDate: new Date('2026-10-11T12:00:00').toISOString() },
  ] });
  const view = await render(tree(TaskListScreen));
  expect(view.getByText('今天（1）')).toBeTruthy();
  expect(view.getByText('之后（1）')).toBeTruthy();
  await act(async () => { jest.advanceTimersByTime(30_000); });
  expect(view.getByText('逾期（1）')).toBeTruthy();
  expect(view.getByText('今天（1）')).toBeTruthy();
  expect(view.queryByText('之后（1）')).toBeNull();
});

test('calendar updates its today mark at midnight without changing the selected date', async () => {
  const view = await render(tree(CalendarScreen));
  expect(view.getByLabelText('2026年10月10日，今天')).toBeTruthy();
  await act(async () => { jest.advanceTimersByTime(30_000); });
  expect(view.queryByLabelText('2026年10月10日，今天')).toBeNull();
  expect(view.getByLabelText('2026年10月11日，今天')).toBeTruthy();
  expect(view.getByLabelText('2026年10月10日').props.accessibilityState.selected).toBe(true);
  expect(view.getByLabelText('回到今天')).toBeTruthy();
});

// Invariant: a list in household B must never display a late response or cached
// content from household A, including when loading B fails.
describe.each([
  ['tasks', TaskListScreen], ['notes', NotesListScreen],
  ['rules', RecurrenceListScreen], ['labels', LabelsScreen],
] as const)('%s household isolation', (key, Screen) => {
  test('ignores a response from the previous household arriving late', async () => {
    let finishOld!: (value: unknown) => void;
    mockLists[key].mockReturnValueOnce(new Promise(resolve => { finishOld = resolve; }));
    const view = await render(tree(Screen));
    mockHouseholdId = 'household-2';
    mockLists[key].mockResolvedValue({ [key]: [item('新家庭内容')] });
    await view.rerender(tree(Screen));
    expect(view.getByText('新家庭内容')).toBeTruthy();
    await act(async () => { finishOld({ [key]: [item('旧家庭内容')] }); });
    expect(view.queryByText('旧家庭内容')).toBeNull();
    expect(view.getByText('新家庭内容')).toBeTruthy();
  });

  test('does not retain another household\'s cached list on a load failure', async () => {
    mockLists[key].mockResolvedValueOnce({ [key]: [item('旧家庭内容')] });
    const view = await render(tree(Screen));
    expect(view.getByText('旧家庭内容')).toBeTruthy();
    mockHouseholdId = 'household-2';
    mockLists[key].mockRejectedValue(new Error('offline'));
    await view.rerender(tree(Screen));
    expect(view.queryByText('旧家庭内容')).toBeNull();
  });
});
