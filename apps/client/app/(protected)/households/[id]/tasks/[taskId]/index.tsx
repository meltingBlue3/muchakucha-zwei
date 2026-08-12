import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { GetHouseholdMemberDto, TaskResponseDto } from '@muchakucha/api-client';
import Ban from 'lucide-react-native/icons/ban';
import Pencil from 'lucide-react-native/icons/pencil';

import { sessionApiClient, sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { LabelChip } from '../../../../../../src/features/labels/label-chip';
import { recurrenceInputFromResponse } from '../../../../../../src/features/recurrence/recurrence-picker';
import { formatRecurrenceSummary } from '../../../../../../src/features/recurrence/recurrence-summary';
import { formatDueDate, isOverdue, priorityLabel, statusLabel } from '../../../../../../src/features/tasks/task-utils';
import { AppShell } from '../../../../../../src/ui/household-components';
import { Heading, Stack, Text } from '../../../../../../src/ui/primitives';
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
    setLoading(true);
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

  const handleEdit = useCallback(() => {
    void router.push(`/households/${encodeURIComponent(id)}/tasks/${encodeURIComponent(taskId)}/edit`);
  }, [router, id, taskId]);

  if (loading) {
    return (
      <AppShell accessibilityLabel="加载任务中" title="任务详情" showBack showProfile>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: activeTheme.spacing[12] }}>
          <ActivityIndicator color={activeTheme.colors.coral} />
        </View>
      </AppShell>
    );
  }

  if (task === null || error !== null) {
    return (
      <AppShell accessibilityLabel="任务加载失败" title="任务详情" showBack showProfile>
        <Stack gap={4}>
          <Text>{error ?? '任务未找到。'}</Text>
          <Pressable onPress={() => router.back()} hitSlop={activeTheme.spacing[4]}>
            <Text variant="label" color="coral">返回任务列表</Text>
          </Pressable>
        </Stack>
      </AppShell>
    );
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

  return (
    <AppShell accessibilityLabel="任务详情" title="任务详情" showBack showProfile>
      <Stack gap={5}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: activeTheme.spacing[3] }}>
          <Heading style={{ flex: 1 }}>{task.title}</Heading>
          <Pressable
            onPress={handleEdit}
            accessibilityLabel="编辑任务"
            accessibilityRole="button"
            hitSlop={activeTheme.spacing[2]}
            style={({ pressed }) => ({
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: activeTheme.controlSizes.touchTarget,
              minWidth: activeTheme.controlSizes.touchTarget,
              borderRadius: activeTheme.borderRadii.md,
              backgroundColor: pressed ? activeTheme.colors.surfaceMuted : 'transparent',
            })}
          >
            <Pencil
              size={activeTheme.controlSizes.icon}
              color={activeTheme.colors.coral}
              strokeWidth={activeTheme.controlSizes.iconStroke}
            />
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: activeTheme.spacing[2], alignItems: 'center' }}>
          <View
            style={{
              alignItems: 'center',
              backgroundColor: cancelled
                ? activeTheme.colors.surfaceMuted
                : task.status === 'completed' || task.status === 'in_progress'
                  ? activeTheme.colors.teal
                  : activeTheme.colors.border,
              flexDirection: 'row',
              gap: activeTheme.spacing[1],
              paddingHorizontal: activeTheme.spacing[3],
              paddingVertical: activeTheme.spacing[1],
              borderRadius: activeTheme.borderRadii.full,
            }}
          >
            {cancelled && <Ban color={activeTheme.colors.inkMuted} size={14} strokeWidth={2} />}
            <Text variant="caption" color={cancelled ? 'inkMuted' : 'surface'}>
              {cancelled ? '已取消' : statusLabel(task.status)}
            </Text>
          </View>
          <View
            style={{
              borderWidth: 1,
              borderColor: task.priority === 'urgent' ? activeTheme.colors.destructive : activeTheme.colors.border,
              paddingHorizontal: activeTheme.spacing[3],
              paddingVertical: activeTheme.spacing[1],
              borderRadius: activeTheme.borderRadii.full,
            }}
          >
            <Text variant="caption" color={task.priority === 'urgent' ? 'destructive' : 'inkMuted'}>
              优先级：{priorityLabel(task.priority)}
            </Text>
          </View>
          {overdue && (
            <Text variant="caption" color="destructive">已逾期</Text>
          )}
        </View>

        <Stack gap={1}>
          <Text variant="label" color="inkMuted">截止日期</Text>
          <Text variant="body" color={overdue ? 'destructive' : 'ink'}>
            {task.dueDate !== null && task.dueDate !== undefined && task.dueDate !== '' ? formatDueDate(task.dueDate) : '未设置'}
          </Text>
        </Stack>

        {task.recurrenceRuleId != null && recurrenceSummary !== null && (
          <Stack gap={1}>
            <Text variant="label" color="inkMuted">重复</Text>
            <Text variant="body">{recurrenceSummary.summary}</Text>
            {recurrenceSummary.clampNote !== null && (
              <Text variant="caption" color="inkMuted">{recurrenceSummary.clampNote}</Text>
            )}
            {recurrenceSummary.timeZoneNote !== null && (
              <Text variant="caption" color="inkMuted">{recurrenceSummary.timeZoneNote}</Text>
            )}
            {cancelled && (
              <Text variant="caption" color="inkMuted">这次重复已取消。</Text>
            )}
          </Stack>
        )}

        <Stack gap={1}>
          <Text variant="label" color="inkMuted">负责人</Text>
          <Text variant="body">{assigneeNames.length > 0 ? assigneeNames.join('、') : '未分配'}</Text>
        </Stack>

        {task.description !== null && task.description !== '' && (
          <Stack gap={1}>
            <Text variant="label" color="inkMuted">描述</Text>
            <Text variant="body">{task.description}</Text>
          </Stack>
        )}

        {task.labels.length > 0 && (
          <Stack gap={1}>
            <Text variant="label" color="inkMuted">标签</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: activeTheme.spacing[2] }}>
              {task.labels.map((label) => (
                <LabelChip key={label.id} label={label} />
              ))}
            </View>
          </Stack>
        )}
      </Stack>
    </AppShell>
  );
}
