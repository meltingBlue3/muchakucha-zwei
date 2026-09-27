import { TaskWindow } from '../../../../../../src/features/tasks/task-window';
import { rememberRouteTrigger } from '../../../../../../src/platform/overlays/route-trigger';
import { isEditConflict } from '../../../../../../src/ui/edit-conflict';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { GetHouseholdMemberDto, TaskResponseDto } from '@muchakucha/api-client';

import { ApiClientError } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { LabelChip } from '../../../../../../src/features/labels/label-chip';
import { recurrenceInputFromResponse } from '../../../../../../src/features/recurrence/recurrence-options';
import { formatRecurrenceSummary } from '../../../../../../src/features/recurrence/recurrence-summary';
import { formatDueDate, isOverdue, priorityLabel, statusLabel } from '../../../../../../src/features/tasks/task-utils';
import { Button, Heading, Stack, Text } from '../../../../../../src/ui/primitives';
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTask = useCallback(async () => {
    if (id === undefined || taskId === undefined) return;
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setError('登录已过期。');
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
        {loading ? <ActivityIndicator accessibilityLabel="正在加载任务" color={activeTheme.colors.coral} /> : <>
          <Text accessibilityRole="alert">{error ?? '任务未找到或已被删除。'}</Text>
          <Button label="重试" tone="secondary" onPress={() => void fetchTask()} />
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
      {statusError ? <Text variant="bodySm" color="destructive" accessibilityRole="alert">{statusError}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: activeTheme.spacing[2] }}>
        {!cancelled ? <Button label={task.status === 'completed' ? '标记为未完成' : '标记为完成'} loading={statusBusy} onPress={() => void writeStatus(task.status === 'completed' ? 'pending' : 'completed')} style={{ flexGrow: 1 }} /> : null}
        <Button label="编辑" accessibilityLabel="编辑任务" tone="secondary" disabled={statusBusy} onPress={handleEdit} style={{ flexGrow: 1 }} />
      </View>
      {!cancelled && task.status !== 'completed' ? <>
        <Pressable accessibilityRole="button" accessibilityLabel="更多任务操作" accessibilityState={{ expanded: moreOpen }} disabled={statusBusy} onPress={() => setMoreOpen(v => !v)} style={{ minHeight: activeTheme.controlSizes.touchTarget, justifyContent: 'center', alignSelf: 'flex-start' }}>
          <Text variant="label" color="inkMuted">{moreOpen ? '收起操作' : '更多操作'}</Text>
        </Pressable>
        {moreOpen ? <Button label={task.status === 'in_progress' ? '退回待办' : '标记为进行中'} tone="secondary" disabled={statusBusy} onPress={() => void writeStatus(task.status === 'in_progress' ? 'pending' : 'in_progress')} /> : null}
      </> : null}
    </Stack>
  );
  return (
    <TaskWindow title="任务详情" busy={statusBusy} footer={footer}>
      <Stack gap={5}>
        <Stack gap={2}>
          <Heading>{task.title}</Heading>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: activeTheme.spacing[2] }}>
            <Text variant="label" color={task.status === 'completed' || task.status === 'in_progress' ? 'teal' : 'inkMuted'}>{cancelled ? '已取消' : statusLabel(task.status)}</Text>
            {overdue ? <Text variant="label" color="destructive">已逾期</Text> : null}
          </View>
        </Stack>
        <View style={{ backgroundColor: activeTheme.colors.surfaceSubtle, borderRadius: activeTheme.borderRadii.lg, padding: activeTheme.spacing[4], gap: activeTheme.spacing[3] }}>
          <DetailRow label="截止日期" value={task.dueDate ? formatDueDate(task.dueDate) : '未设置'} urgent={overdue} />
          <DetailRow label="负责人" value={assigneeNames.join('、') || '未分配'} />
          <DetailRow label="优先级" value={priorityLabel(task.priority)} urgent={task.priority === 'urgent'} />
          {recurrenceSummary ? <Stack gap={1}>
            <DetailRow label="重复安排" value={recurrenceSummary.summary} />
            {recurrenceSummary.clampNote ? <Text variant="caption" color="inkMuted">{recurrenceSummary.clampNote}</Text> : null}
            {recurrenceSummary.timeZoneNote ? <Text variant="caption" color="inkMuted">{recurrenceSummary.timeZoneNote}</Text> : null}
            <Text variant="caption" color="inkMuted">{cancelled ? '这次重复已取消。' : '当前查看这一次任务，编辑时可选择影响范围。'}</Text>
          </Stack> : null}
        </View>
        {task.description ? <Stack gap={2}><Text variant="label" color="inkMuted">描述</Text><Text>{task.description}</Text></Stack> : null}
        {(task.labels ?? []).length ? <Stack gap={2}>
          <Text variant="label" color="inkMuted">标签</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: activeTheme.spacing[2] }}>{task.labels?.map(label => <LabelChip key={label.id} label={label} />)}</View>
        </Stack> : null}
      </Stack>
    </TaskWindow>
  );
}

function DetailRow({ label, value, urgent = false }: { label: string; value: string; urgent?: boolean }) {
  const theme = useTheme<Theme>();
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[2], alignItems: 'flex-start' }}>
    <Text variant="bodySm" color="inkMuted">{label}</Text>
    <Text variant="bodySm" color={urgent ? 'destructive' : 'ink'} style={{ flexGrow: 1, flexShrink: 1, textAlign: 'right' }}>{value}</Text>
  </View>;
}
