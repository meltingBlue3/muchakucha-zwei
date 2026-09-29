import { isEditConflict } from '../../ui/edit-conflict';
import { useCallback, useState } from 'react';
import { ApiClientError, type TaskResponseDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { completionToggleTarget, type TaskStatus } from './task-completion';
import type { ActionNoticeProps } from '../../ui/action-notice';

interface Attempt {
  task: TaskResponseDto;
  target: TaskStatus;
  /** What the task was before this attempt, so an undo can put it back exactly. */
  previousStatus: TaskStatus;
}

export interface TaskCardCompletionProps {
  onToggleComplete: (task: TaskResponseDto) => void;
  statusChanging: boolean;
  statusError: string | null;
  onRetryStatus?: () => void;
}

/**
 * Owns the completion control's state for a list of tasks: which row is
 * writing, which row failed, and which completion can still be undone. The
 * undo is offered in a notice at the top of the page, not on the card.
 *
 * It lives here because the today view and the tasks list both drive the same
 * control, and previously each kept its own copy — the tasks list had even
 * re-inlined the status rotation rather than importing it, so the two could
 * drift without anything failing.
 *
 * Failure is held per task rather than per page so the message and its retry
 * can render on the row the person actually tapped. A page-level banner sat at
 * the top of a scrolling list, off screen from the card that failed.
 */
export function useTaskCompletion(householdId: string | undefined, refresh: () => void) {
  const [changingTaskId, setChangingTaskId] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ taskId: string; message: string } | null>(null);
  const [undoable, setUndoable] = useState<{ task: TaskResponseDto; previousStatus: TaskStatus } | null>(null);
  const [lastAttempt, setLastAttempt] = useState<Attempt | null>(null);

  const write = useCallback(async (attempt: Attempt): Promise<void> => {
    if (householdId === undefined || householdId === '') return;
    setFailure(null);
    setLastAttempt(attempt);
    setChangingTaskId(attempt.task.id);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setFailure({ taskId: attempt.task.id, message: '登录已过期，请重新登录。' });
        return;
      }
      const saved = await sessionApiClient.updateTask(token, householdId, attempt.task.id, {
        status: attempt.target,
        expectedUpdatedAt: attempt.task.updatedAt,
        ...(attempt.task.recurrence ? { expectedRuleUpdatedAt: attempt.task.recurrence.updatedAt } : {}),
      });
      // Only a completion is undoable, and only until the next write.
      setUndoable(attempt.target === 'completed' ? { task: saved ?? attempt.task, previousStatus: attempt.previousStatus } : null);
      refresh();
    } catch (caught: unknown) {
      if (isEditConflict(caught)) { setLastAttempt(null); setUndoable(null); }
      // WR-14: a 403 (another member's task), a 404 (the occurrence was
      // cancelled or split away by someone else), and an offline device all
      // looked identical — the spinner stopped and the card re-rendered
      // unchanged, so the tap appeared not to have registered. Surface it and
      // refetch so the row shows authoritative state either way.
      setFailure({
        taskId: attempt.task.id,
        message:
          isEditConflict(caught) ? '内容已更新，请查看最新状态后再操作。' : caught instanceof ApiClientError && caught.status === 403
            ? '你没有权限修改这个任务。'
            : '状态没有更新成功，请重试。',
      });
      refresh();
    } finally {
      setChangingTaskId(null);
    }
  }, [householdId, refresh]);

  const toggleCompletion = useCallback((task: TaskResponseDto): void => {
    const target = completionToggleTarget(task.status);
    if (target === null) return;
    void write({ task, target, previousStatus: task.status as TaskStatus });
  }, [write]);

  const undoCompletion = useCallback((): void => {
    if (undoable === null) return;
    void write({ task: undoable.task, target: undoable.previousStatus, previousStatus: 'completed' });
  }, [undoable, write]);

  const retryStatus = useCallback((): void => {
    if (lastAttempt === null) return;
    void write(lastAttempt);
  }, [lastAttempt, write]);

  /** The completion-related props for one row, so a call site stays one line. */
  const cardProps = useCallback((task: TaskResponseDto): TaskCardCompletionProps => ({
    onToggleComplete: toggleCompletion,
    statusChanging: changingTaskId === task.id,
    statusError: failure !== null && failure.taskId === task.id ? failure.message : null,
    ...(lastAttempt === null ? {} : { onRetryStatus: retryStatus }),
  }), [toggleCompletion, changingTaskId, failure, retryStatus, lastAttempt]);

  /** Closes the notice; the completed card then leaves the list with it. */
  const dismissUndo = useCallback((): void => setUndoable(null), []);

  /** Props for the page's ActionNotice while a completion can be undone. */
  const undoNotice: ActionNoticeProps | null = undoable === null ? null : {
    message: `已完成「${undoable.task.title}」`,
    actionLabel: '撤销',
    actionAccessibilityLabel: `撤销完成：${undoable.task.title}`,
    onAction: undoCompletion,
    onDismiss: dismissUndo,
    busy: changingTaskId === undoable.task.id,
  };

  return {
    cardProps,
    toggleCompletion,
    undoCompletion,
    dismissUndo,
    undoNotice,
    retryStatus,
    changingTaskId,
    /** The just-completed task a list keeps visible while its undo notice is open. */
    undoTaskId: undoable?.task.id ?? null,
  };
}
