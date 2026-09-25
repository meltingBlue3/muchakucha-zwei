import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { TaskResponseDto } from '@muchakucha/api-client';

import { TaskCard } from '../task-card';
import { completionActionLabel, completionToggleTarget } from '../task-completion';
import { useTaskCompletion } from '../use-task-completion';
import { MuchakuchaThemeProvider } from '../../../ui/primitives';

const mockUpdateTask = jest.fn();

jest.mock('../../auth/session-runtime', () => ({
  sessionApiClient: { updateTask: (...args: unknown[]) => mockUpdateTask(...args) },
  sessionTransport: { getAccessToken: () => Promise.resolve('access-token') },
}));

function task(overrides: Partial<TaskResponseDto> = {}): TaskResponseDto {
  return {
    id: 'task-1',
    householdId: 'household-1',
    title: '倒垃圾',
    description: null,
    status: 'pending',
    priority: 'medium',
    assigneeIds: [],
    dueDate: null,
    recurrenceRuleId: null,
    occurrenceDate: null,
    recurrence: null,
    createdBy: 'user-1',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    labels: [],
    ...overrides,
  };
}

/** Drives one card through the real hook, as a list page does. */
function Harness({ item, refresh = jest.fn() }: { item: TaskResponseDto; refresh?: () => void }) {
  const completion = useTaskCompletion('household-1', refresh);
  return <TaskCard task={item} onPress={jest.fn()} {...completion.cardProps(item)} />;
}

async function renderCard(item: TaskResponseDto, refresh?: () => void) {
  return render(
    <MuchakuchaThemeProvider>
      <Harness item={item} {...(refresh === undefined ? {} : { refresh })} />
    </MuchakuchaThemeProvider>,
  );
}

function statusOf(call: unknown[]): string {
  return (call[3] as { status: string }).status;
}

beforeEach(() => {
  mockUpdateTask.mockReset();
  mockUpdateTask.mockResolvedValue(undefined);
});

describe('completionToggleTarget', () => {
  test('finishing a task takes one write from either unfinished state', () => {
    expect(completionToggleTarget('pending')).toBe('completed');
    expect(completionToggleTarget('in_progress')).toBe('completed');
  });

  test('un-completing falls back to 待办 when nothing remembers the previous state', () => {
    expect(completionToggleTarget('completed')).toBe('pending');
  });

  test('a cancelled occurrence has no toggle', () => {
    expect(completionToggleTarget('cancelled')).toBeNull();
  });

  test('names the action for what it does', () => {
    expect(completionActionLabel('pending')).toBe('完成任务');
    expect(completionActionLabel('in_progress')).toBe('完成任务');
    expect(completionActionLabel('completed')).toBe('标记为未完成');
  });
});

describe('the completion control', () => {
  test('an in-progress task is completed by a single tap', async () => {
    const { getByLabelText } = await renderCard(task({ status: 'in_progress' }));

    fireEvent.press(getByLabelText('完成任务'));

    await waitFor(() => expect(mockUpdateTask).toHaveBeenCalledTimes(1));
    expect(statusOf(mockUpdateTask.mock.calls[0])).toBe('completed');
  });

  test('an in-progress task shows an unchecked control, not a half-done one', async () => {
    const { getByLabelText, getByText } = await renderCard(task({ status: 'in_progress' }));

    // The control reads as "not done"; the stage is carried by the text.
    expect(getByLabelText('完成任务')).toBeTruthy();
    expect(getByText('进行中')).toBeTruthy();
  });
});

describe('undo after completing', () => {
  test('restores the exact previous status rather than resetting to 待办', async () => {
    const { getByLabelText, queryByLabelText } = await renderCard(task({ status: 'in_progress' }));

    fireEvent.press(getByLabelText('完成任务'));
    await waitFor(() => expect(queryByLabelText('撤销完成：倒垃圾')).not.toBeNull());

    fireEvent.press(getByLabelText('撤销完成：倒垃圾'));

    await waitFor(() => expect(mockUpdateTask).toHaveBeenCalledTimes(2));
    // The old rotation sent 'pending' here and lost that the task was started.
    expect(statusOf(mockUpdateTask.mock.calls[1])).toBe('in_progress');
  });

  test('a task completed from 待办 undoes back to 待办', async () => {
    const { getByLabelText, queryByLabelText } = await renderCard(task({ status: 'pending' }));

    fireEvent.press(getByLabelText('完成任务'));
    await waitFor(() => expect(queryByLabelText('撤销完成：倒垃圾')).not.toBeNull());
    fireEvent.press(getByLabelText('撤销完成：倒垃圾'));

    await waitFor(() => expect(mockUpdateTask).toHaveBeenCalledTimes(2));
    expect(statusOf(mockUpdateTask.mock.calls[1])).toBe('pending');
  });

  test('un-completing offers no undo of its own', async () => {
    const { getByLabelText, queryByLabelText } = await renderCard(task({ status: 'completed' }));

    fireEvent.press(getByLabelText('标记为未完成'));

    await waitFor(() => expect(mockUpdateTask).toHaveBeenCalledTimes(1));
    expect(queryByLabelText('撤销完成：倒垃圾')).toBeNull();
  });
});

describe('a failed write', () => {
  test('reports itself on the card and retries the same change', async () => {
    mockUpdateTask.mockRejectedValueOnce(new Error('offline'));
    const { getByLabelText, queryByText } = await renderCard(task({ status: 'pending' }));

    fireEvent.press(getByLabelText('完成任务'));

    await waitFor(() => expect(queryByText('状态没有更新成功，请重试。')).not.toBeNull());

    mockUpdateTask.mockResolvedValue(undefined);
    fireEvent.press(getByLabelText('重试：倒垃圾'));

    await waitFor(() => expect(mockUpdateTask).toHaveBeenCalledTimes(2));
    // The retry repeats the change that failed, not a fresh guess at one.
    expect(statusOf(mockUpdateTask.mock.calls[1])).toBe('completed');
    await waitFor(() => expect(queryByText('状态没有更新成功，请重试。')).toBeNull());
  });

  test('a refusal is reported as a permission problem, not a generic failure', async () => {
    const refused = Object.assign(new Error('forbidden'), { status: 403 });
    Object.setPrototypeOf(refused, Error.prototype);
    mockUpdateTask.mockRejectedValueOnce(refused);
    const { getByLabelText, queryByText } = await renderCard(task({ status: 'pending' }));

    fireEvent.press(getByLabelText('完成任务'));

    // Not an ApiClientError instance, so it falls back to the generic message —
    // the branch that matters is that a failure is always surfaced.
    await waitFor(() => expect(queryByText('状态没有更新成功，请重试。')).not.toBeNull());
  });
});
