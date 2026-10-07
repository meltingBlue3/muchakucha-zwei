import { TaskWindow } from '../../../../../../src/features/tasks/task-window';
import { rememberRouteTrigger } from '../../../../../../src/platform/overlays/route-trigger';
import { isEditConflict } from '../../../../../../src/ui/edit-conflict';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { GetHouseholdMemberDto, TaskResponseDto } from '@muchakucha/api-client';

import { ApiClientError } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { LabelChip } from '../../../../../../src/features/labels/label-chip';
import { recurrenceInputFromResponse } from '../../../../../../src/features/recurrence/recurrence-options';
import { formatRecurrenceSummary } from '../../../../../../src/features/recurrence/recurrence-summary';
import { formatDueDate, isOverdue, priorityLabel, statusLabel } from '../../../../../../src/features/tasks/task-utils';
import { DetailField, DetailPanel } from '../../../../../../src/ui/detail-fields';
import { Banner, Button, Heading, LoadError, LoadingState, Stack, Text } from '../../../../../../src/ui/primitives';
import type { Theme } from '../../../../../../src/ui/theme';

function currentTimeZone(fallback: string): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || fallback;
  } catch {
    return fallback;
  }
}

export default function TaskDetailRoute() {
  const { id, taskId } = useLocalSearchParams<{ id: string; taskId: string }>();
  const router = useRouter();
  const activeTheme = useTheme<Theme>();
  const [task, setTask] = useState<TaskResponseDto | null>(null);
  const [members, setMembers] = useState<GetHouseholdMemberDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTask = useCallback(async () => {
    if (id === undefined || taskId === undefined) return;
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setError('登录已过期，请重新登录。');
        return;
      }
      const [taskResult, householdResult] = await Promise.all([
        sessionApiClient.getTask(token, id, taskId),
        sessionApiClient.getHousehold(token, id),
      ]);
      setTask(taskResult);
      setMembers(householdResult.members);
    } catch {
      setError('无法加载任务。');
    } finally {
      setLoading(false);
    }
  }, [id, taskId]);

  // Refetch whenever this screen regains focus (e.g. returning from the
  // edit screen), not just on first mount — otherwise a save doesn't show
  // up here until the whole route remounts.
  useFocusEffect(
    useCallback(() => {
      void fetchTask();
    }, [fetchTask]),
  );

  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // 进行中 lives here rather than on the card: it is a deliberate stage, not a
  // step on the way to done, and putting it in the list's completion control
  // made finishing a task take two taps.
  const writeStatus = useCallback(async (next: 'pending' | 'in_progress' | 'completed') => {
    if (id === undefined || taskId === undefined || task === null) return;
    setStatusBusy(true);
    setStatusError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setStatusError('登录已过期，请重新登录。');
        return;
      }
      await sessionApiClient.updateTask(token, id, taskId, {
        status: next,
        expectedUpdatedAt: task.updatedAt,
        ...(task.recurrence ? { expectedRuleUpdatedAt: task.recurrence.updatedAt } : {}),
      });
      await fetchTask();
    } catch (caught: unknown) {
      setStatusError(
        isEditConflict(caught) ? '内容已更新，请查看最新状态后再操作。' : caught instanceof ApiClientError && caught.status === 403
          ? '你没有权限修改这个任务。'
          : '状态没有更新成功，请重试。',
      );
      if (isEditConflict(caught)) await fetchTask();
    } finally {
      setStatusBusy(false);
    }
  }, [id, taskId, task, fetchTask]);

  const handleEdit = useCallback(() => {
    rememberRouteTrigger();
    void router.push(`/households/${encodeURIComponent(id)}/tasks/${encodeURIComponent(taskId)}/edit`);
  }, [router, id, taskId]);

  if (loading || task === null || error !== null) {
    return <TaskWindow title="任务详情" busy={statusBusy}>
      <Stack gap={4}>
        {loading ? <LoadingState label="正在加载任务" /> : <>
          <LoadError message={error ?? '任务未找到或已被删除。'} onRetry={() => void fetchTask()} />
        </>}
      </Stack>
    </TaskWindow>;
  }

  const assigneeNames = (task.assigneeIds ?? []).map(
    (uid) => members.find((m) => m.userId === uid)?.displayName ?? '未知成员',
  );
  const cancelled = task.status === 'cancelled';
  const overdue = isOverdue(task.dueDate ?? null) && task.status !== 'completed' && !cancelled;
  const recurrence = recurrenceInputFromResponse(task.recurrence);
  const recurrenceSummary =
    recurrence === null
      ? null
      : formatRecurrenceSummary(recurrence, currentTimeZone(recurrence.timezone));

  const footer = (
    <Stack gap={2}>
      {statusError ? <Banner>{statusError}</Banner> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: activeTheme.spacing[2] }}>
        {!cancelled ? <Button label={task.status === 'completed' ? '标记为未完成' : '标记为完成'} loading={statusBusy} onPress={() => void writeStatus(task.status === 'completed' ? 'pending' : 'completed')} style={{ flexGrow: 1 }} /> : null}
        <Button label="编辑任务" tone="secondary" disabled={statusBusy} onPress={handleEdit} style={{ flexGrow: 1 }} />
      </View>
    </Stack>
  );
  return (
    <TaskWindow title="任务详情" busy={statusBusy} footer={footer}>
      <Stack gap={5}>
        <Stack gap={2}>
          <Heading level={2}>{task.title}</Heading>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: activeTheme.spacing[2] }}>
            <Text variant="label" color={task.status === 'completed' ? 'success' : task.status === 'in_progress' ? 'ink' : 'inkMuted'}>{cancelled ? '已取消' : statusLabel(task.status)}</Text>
            {overdue ? <Text variant="label" color="destructive">已逾期</Text> : null}
            {/* 进行中 is a deliberate stage, offered beside the status it changes rather than behind a "more" toggle. */}
            {!cancelled && task.status !== 'completed' ? (
              <Pressable accessibilityRole="button" accessibilityLabel={task.status === 'in_progress' ? '退回待办' : '标记为进行中'} disabled={statusBusy} onPress={() => void writeStatus(task.status === 'in_progress' ? 'pending' : 'in_progress')} style={{ minHeight: activeTheme.controlSizes.touchTarget, justifyContent: 'center', marginLeft: 'auto' }}>
                <Text variant="label" color={statusBusy ? 'inkMuted' : 'link'}>{task.status === 'in_progress' ? '退回待办' : '标记为进行中'}</Text>
              </Pressable>
            ) : null}
          </View>
        </Stack>
        <DetailPanel>
          <DetailField label="截止日期" value={task.dueDate ? formatDueDate(task.dueDate) : '未设置'} urgent={overdue} />
          <DetailField label="负责人" value={assigneeNames.join('、') || '未分配'} />
          <DetailField label="优先级" value={priorityLabel(task.priority)} urgent={task.priority === 'urgent'} />
          {recurrenceSummary ? <DetailField label="重复安排" value={recurrenceSummary.summary} notes={[
            recurrenceSummary.clampNote,
            recurrenceSummary.timeZoneNote,
            cancelled ? '这次重复已取消。' : '当前查看这一次任务，编辑时可选择影响范围。',
          ]} /> : null}
        </DetailPanel>
        {task.description ? <Stack gap={2}><Text variant="label" color="inkMuted">描述</Text><Text>{task.description}</Text></Stack> : null}
        {(task.labels ?? []).length ? <Stack gap={2}>
          <Text variant="label" color="inkMuted">标签</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: activeTheme.spacing[2] }}>{task.labels?.map(label => <LabelChip key={label.id} label={label} />)}</View>
        </Stack> : null}
      </Stack>
    </TaskWindow>
  );
}

