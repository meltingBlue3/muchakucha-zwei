export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

/**
 * The status a list's completion control writes for a task currently in
 * `status`.
 *
 * The control answers one question — is this done? — so it only ever writes
 * `completed` or leaves that state. It replaced a three-state rotation
 * (待办 → 进行中 → 已完成 → 待办) that read as a checkbox but needed two taps
 * to finish a task and silently discarded 进行中 on the way back round.
 *
 * `cancelled` is terminal here: it is only ever set by the recurrence
 * machinery, never by a person, so a list offers no way out of it.
 *
 * Un-completing falls back to 待办 because nothing records what the task was
 * before. Restoring the actual previous status is what the undo affordance is
 * for, and it is the only path that can promise it.
 */
export function completionToggleTarget(status: string): TaskStatus | null {
  if (status === 'cancelled') return null;
  return status === 'completed' ? 'pending' : 'completed';
}

/** Accessible name for the completion control. */
export function completionActionLabel(status: string): string {
  if (status === 'cancelled') return '这次重复已取消';
  return status === 'completed' ? '标记为未完成' : '完成任务';
}
