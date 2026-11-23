import type { PropsWithChildren } from 'react';
import type { EventListResponseDto, EventResponseDto, TaskResponseDto } from '@muchakucha/api-client';
import { act, fireEvent, render } from '@testing-library/react-native';
import { AppState, Dimensions, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import TodayRoute from '../../../../app/(protected)/households/[id]/today';
import { MuchakuchaThemeProvider } from '../../../ui/primitives';

const mockListEvents = jest.fn();
const mockListTasks = jest.fn();

jest.mock('expo-router', () => ({ usePathname: () => '/',
  useLocalSearchParams: () => ({ id: 'household-1' }),
  useGlobalSearchParams: () => ({}),
  useRouter: () => ({ push: jest.fn() }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(effect, [effect]);
  },
}));

jest.mock('../../auth/session-runtime', () => ({
  sessionStateStore: jest.requireActual('../../auth/session-state').createSessionStateStore(),
  sessionApiClient: {
    listEvents: (...args: unknown[]) => mockListEvents(...args),
    listTasks: (...args: unknown[]) => mockListTasks(...args),
    getHousehold: () => Promise.resolve({ members: [] }),
  },
  sessionTransport: { getAccessToken: () => Promise.resolve('access-token') },
}));

jest.mock('../../households/household-context', () => ({
  useHouseholdContext: () => ({
    viewState: 'ready', currentHouseholdId: 'household-1', households: [],
  }),
}));

jest.mock('../../households/household-screen', () => ({
  HouseholdScreen: ({ children }: PropsWithChildren) => children,
}));

function event(id: string, start: string, end: string): EventResponseDto {
  return {
    id, householdId: 'household-1', title: id,
    startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString(),
    allDay: false, location: null, createdBy: 'user-1',
    createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', labels: [], myReminder: { mode: 'default', minutesBefore: null },
  };
}

const yesterday = event('10日已结束的日程', '2026-10-10T18:00:00', '2026-10-10T19:00:00');
const today = event('11日的日程', '2026-10-11T09:00:00', '2026-10-11T10:00:00');

function mount() {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>
      <MuchakuchaThemeProvider><TodayRoute /></MuchakuchaThemeProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-11T08:00:00'));
  mockListEvents.mockReset().mockResolvedValue({ events: [yesterday, today] });
  mockListTasks.mockReset().mockResolvedValue({ tasks: [] });
});

afterEach(() => jest.useRealTimers());

// Invariant: Today contains only events that overlap the current local date,
// even when the API returns a padded range or the mounted screen crosses midnight.
test('on October 11 excludes an ended October 10 event returned by the API', async () => {
  const view = await mount();
  expect(view.getByText(today.title)).toBeTruthy();
  expect(view.queryByText(yesterday.title)).toBeNull();
  expect(view.getByText(/1 个日程/)).toBeTruthy();
});

test('a mounted Today screen switches its events at local midnight', async () => {
  jest.setSystemTime(new Date('2026-10-10T23:59:30'));
  mockListEvents.mockImplementation((_token: string, _id: string, date: string) =>
    Promise.resolve({ events: date === '2026-10-10' ? [yesterday] : [today] }));
  const view = await mount();
  expect(view.getByText(yesterday.title)).toBeTruthy();
  await act(async () => { jest.advanceTimersByTime(30_000); });
  expect(view.queryByText(yesterday.title)).toBeNull();
  expect(view.getByText(today.title)).toBeTruthy();
});

test('keeps overlapping and local early/late events, excludes adjacent local dates', async () => {
  const spanning = event('跨日行程', '2026-10-09T09:00:00', '2026-10-12T09:00:00');
  const early = event('凌晨安排', '2026-10-11T00:00:00', '2026-10-11T00:30:00');
  const late = event('深夜安排', '2026-10-11T23:30:00', '2026-10-11T23:59:59');
  const tomorrow = event('明天安排', '2026-10-12T00:00:00', '2026-10-12T00:30:00');
  const allDay = { ...event('全天安排', '2026-10-11T00:00:00', '2026-10-11T23:59:59'), allDay: true };
  // As in the API, calendar expansion includes events that started before the range.
  mockListEvents.mockImplementation((_token, _id, _from, _to, _recurring, _signal, expand) =>
    Promise.resolve({ events: [yesterday, early, late, tomorrow, allDay, ...(expand ? [spanning] : [])] }));
  const view = await mount();
  for (const item of [early, late, allDay, spanning]) expect(view.getByText(item.title)).toBeTruthy();
  for (const item of [yesterday, tomorrow]) expect(view.queryByText(item.title)).toBeNull();
  expect(view.getByText(/4 个日程/)).toBeTruthy();
});

test('resumes on the new date immediately after being in the background overnight', async () => {
  jest.setSystemTime(new Date('2026-10-10T23:00:00'));
  const subscription = jest.spyOn(AppState, 'addEventListener');
  mockListEvents.mockResolvedValueOnce({ events: [yesterday] }).mockResolvedValue({ events: [today] });
  const view = await mount();
  expect(view.getByText(yesterday.title)).toBeTruthy();
  await act(async () => {
    jest.setSystemTime(new Date('2026-10-11T08:00:00'));
    for (const [type, listener] of subscription.mock.calls) if (type === 'change') listener('active');
  });
  expect(view.getByText('10月11日')).toBeTruthy();
  expect(view.queryByText(yesterday.title)).toBeNull();
  expect(view.getByText(today.title)).toBeTruthy();
});

test('repartitions tasks at midnight even if the refreshed task list is unchanged', async () => {
  jest.setSystemTime(new Date('2026-10-10T23:59:30'));
  const task = (title: string, dueDate: string): TaskResponseDto => ({
    id: title, title, householdId: 'household-1', dueDate: new Date(dueDate).toISOString(),
    status: 'pending', priority: 'medium', assigneeIds: [], labels: [], createdBy: 'user-1', myReminder: { mode: 'default', minutesBefore: null },
    createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  });
  mockListEvents.mockResolvedValue({ events: [] });
  mockListTasks.mockResolvedValue({ tasks: [
    task('10日未完成的任务', '2026-10-10T12:00:00'),
    task('11日到期的任务', '2026-10-11T12:00:00'),
  ] });
  const view = await mount();
  expect(view.queryByText('逾期任务（1）')).toBeNull();
  expect(view.queryByText('11日到期的任务')).toBeNull();
  await act(async () => { jest.advanceTimersByTime(30_000); });
  expect(view.getByText('逾期任务（1）')).toBeTruthy();
  expect(view.getByText('11日到期的任务')).toBeTruthy();
  expect(view.queryByText('查看后续安排（1）')).toBeNull();
});

test('a failed load after midnight never presents yesterday as today or claims today is empty', async () => {
  jest.setSystemTime(new Date('2026-10-10T23:59:30'));
  mockListEvents.mockResolvedValueOnce({ events: [yesterday] }).mockRejectedValue(new Error('offline'));
  const view = await mount();
  await act(async () => { jest.advanceTimersByTime(30_000); });
  expect(view.queryByText(yesterday.title)).toBeNull();
  expect(view.queryByText('今天很清闲')).toBeNull();
  expect(view.getByText('无法加载今日数据，请检查网络连接后重试。')).toBeTruthy();
  mockListEvents.mockResolvedValue({ events: [today] });
  await fireEvent.press(view.getByLabelText('重试加载今日数据'));
  expect(view.getByText(today.title)).toBeTruthy();
});

test('a response started yesterday cannot overwrite the new day after arriving late', async () => {
  jest.setSystemTime(new Date('2026-10-10T23:59:30'));
  let finishYesterday!: (value: EventListResponseDto) => void;
  mockListEvents.mockReturnValueOnce(new Promise<EventListResponseDto>(resolve => { finishYesterday = resolve; }))
    .mockResolvedValue({ events: [today] });
  const view = await mount();
  await act(async () => { jest.advanceTimersByTime(30_000); });
  expect(view.getByText(today.title)).toBeTruthy();
  await act(async () => { finishYesterday({ events: [yesterday], total: 1 }); });
  expect(view.getByText(today.title)).toBeTruthy();
  expect(view.queryByText(yesterday.title)).toBeNull();
});

test('on desktop loads the full visible month grid for the mini calendar and refetches when switching months', async () => {
  const originalOS = Platform.OS;
  const originalDims = Dimensions.get('window');
  Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
  Dimensions.set({ window: { ...originalDims, width: 1440, height: 900 } });
  try {
    const octLate = event('月底聚餐', '2026-10-28T18:00:00', '2026-10-28T20:00:00');
    const novMid = event('十一月安排', '2026-11-18T09:00:00', '2026-11-18T10:00:00');
    mockListEvents.mockImplementation((_token: string, _id: string, start: string, end: string) => {
      if (start === '2026-09-28' && end === '2026-11-01') return Promise.resolve({ events: [today, octLate] });
      if (start === '2026-10-26' && end === '2026-12-06') return Promise.resolve({ events: [octLate, novMid] });
      return Promise.resolve({ events: start === '2026-10-11' ? [today] : [] });
    });
    mockListTasks.mockResolvedValue({
      tasks: [{
        id: 't1', title: '月底缴费', householdId: 'household-1',
        dueDate: new Date('2026-10-28T10:00:00').toISOString(),
        status: 'pending', priority: 'medium', assigneeIds: [], labels: [], createdBy: 'user-1',
        myReminder: { mode: 'default', minutesBefore: null },
        createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
      }],
    });

    const view = await render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 1440, height: 900 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>
        <MuchakuchaThemeProvider><TodayRoute /></MuchakuchaThemeProvider>
      </SafeAreaProvider>,
    );

    // October 28 (> 7 days after Oct 11) combines the event + task = 2 items; Oct 11 has 1 event.
    expect(view.getByRole('button', { name: '2026年10月11日，今天，1 项安排' })).toBeTruthy();
    expect(view.getByRole('button', { name: '2026年10月28日，2 项安排' })).toBeTruthy();

    // Switching to November loads November's grid without losing Today's timeline.
    await fireEvent.press(view.getByRole('button', { name: '下个月' }));
    expect(view.getByRole('button', { name: '2026年11月18日，1 项安排' })).toBeTruthy();
    expect(view.getByTestId('today-timeline')).toBeTruthy();
    await act(async () => { view.unmount(); });
  } finally {
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
    Dimensions.set({ window: originalDims });
  }
});
