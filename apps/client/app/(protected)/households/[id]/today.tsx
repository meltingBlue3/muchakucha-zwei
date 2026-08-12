import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { EventResponseDto, TaskResponseDto, GetHouseholdMemberDto } from '@muchakucha/api-client';
import Calendar from 'lucide-react-native/icons/calendar';
import Clock from 'lucide-react-native/icons/clock';
import Hourglass from 'lucide-react-native/icons/hourglass';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';

import { sessionApiClient, sessionTransport } from '../../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../../src/features/households/household-context';
import { EventCard } from '../../../../src/features/events/event-card';
import { TaskCard } from '../../../../src/features/tasks/task-card';
import { toDateIso } from '../../../../src/features/events/calendar-utils';
import { isApproachingDeadline, isOverdue } from '../../../../src/features/tasks/task-utils';
import {
  AccessChangedPanel,
  AppShell,
  HouseholdHeader,
  HouseholdSwitcher,
} from '../../../../src/ui/household-components';
import { Stack, Text } from '../../../../src/ui/primitives';
import type { Theme } from '../../../../src/ui/theme';

function todayIso(): string {
  return toDateIso(new Date());
}

function isToday(iso: string | null): boolean {
  if (iso === null || iso === '') return false;
  return toDateIso(new Date(iso)) === todayIso();
}

export function partitionTodayTasks(tasks: TaskResponseDto[]) {
  const overdueTasks: TaskResponseDto[] = [];
  const todayTasks: TaskResponseDto[] = [];
  const approachingTasks: TaskResponseDto[] = [];
  const otherUpcomingTasks: TaskResponseDto[] = [];

  for (const task of tasks) {
    if (task.status === 'completed' || task.status === 'cancelled') continue;
    if (isOverdue(task.dueDate ?? null)) {
      overdueTasks.push(task);
    } else if (isToday(task.dueDate ?? null) || task.dueDate === null || task.dueDate === '') {
      todayTasks.push(task);
    } else if (isApproachingDeadline(task.dueDate ?? null, 7)) {
      approachingTasks.push(task);
    } else {
      otherUpcomingTasks.push(task);
    }
  }

  return { overdueTasks, todayTasks, approachingTasks, otherUpcomingTasks };
}

export function nextTaskStatus(status: string): 'pending' | 'in_progress' | 'completed' | null {
  if (status === 'cancelled') return null;
  if (status === 'pending') return 'in_progress';
  if (status === 'in_progress') return 'completed';
  return 'pending';
}

export default function TodayRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const activeTheme = useTheme<Theme>();
  const {
    viewState,
    households,
    currentHouseholdId,
    accessChangedHouseholdName,
    refreshHouseholds,
    switchHousehold,
  } = useHouseholdContext();

  const [events, setEvents] = useState<EventResponseDto[]>([]);
  const [tasks, setTasks] = useState<TaskResponseDto[]>([]);
  const [members, setMembers] = useState<GetHouseholdMemberDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [statusChangingTaskId, setStatusChangingTaskId] = useState<string | null>(null);

  const householdId = id ?? currentHouseholdId;
  const currentHousehold = households.find((h) => h.id === currentHouseholdId) ?? null;

  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      map.set(m.userId, m.displayName);
    }
    return map;
  }, [members]);

  // Split tasks into groups
  const { overdueTasks, todayTasks, approachingTasks, otherUpcomingTasks } = useMemo(
    () => partitionTodayTasks(tasks),
    [tasks],
  );

  const fetchData = useCallback(async () => {
    if (householdId === undefined || householdId === '') return;
    setLoading(true);
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setError('登录已过期，请重新登录。');
        return;
      }

      const today = todayIso();
      const [eventsResult, tasksResult, householdResult] = await Promise.all([
        sessionApiClient.listEvents(token, householdId, today, today),
        sessionApiClient.listTasks(token, householdId),
        sessionApiClient.getHousehold(token, householdId),
      ]);

      setEvents(eventsResult.events);
      setMembers(householdResult.members);
      setTasks(tasksResult.tasks);
    } catch (err) {
      setError('无法加载今日数据，请检查网络连接后重试。');
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // Refetch whenever this screen regains focus (e.g. returning from a
  // task/event action elsewhere), not just on first mount — otherwise
  // Today shows stale data after a mutation elsewhere in the stack.
  useFocusEffect(
    useCallback(() => {
      void fetchData();
    }, [fetchData]),
  );

  const handleEventPress = useCallback(
    (event: EventResponseDto) => {
      void router.push(
        `/households/${encodeURIComponent(householdId!)}/events/${encodeURIComponent(event.id)}`,
      );
    },
    [router, householdId],
  );

  const handleTaskPress = useCallback(
    (task: TaskResponseDto) => {
      void router.push(
        `/households/${encodeURIComponent(householdId!)}/tasks/${encodeURIComponent(task.id)}`,
      );
    },
    [router, householdId],
  );

  const handleTaskStatusChange = useCallback(async (task: TaskResponseDto) => {
    if (householdId === undefined || householdId === '') return;
    const nextStatus = nextTaskStatus(task.status);
    if (nextStatus === null) return;
    setStatusChangingTaskId(task.id);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) return;
      await sessionApiClient.updateTask(token, householdId, task.id, {
        title: task.title,
        status: nextStatus,
        priority: task.priority,
      });
      void fetchData();
    } catch {
      // silently ignore - failed status change
    } finally {
      setStatusChangingTaskId(null);
    }
  }, [householdId, fetchData]);

  const dateLabel = useMemo(() => {
    const now = new Date();
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 星期${weekDays[now.getDay()]}`;
  }, []);

  const handleSwitch = useCallback(async (householdId: string) => {
    if (householdId === currentHouseholdId) {
      setSwitcherOpen(false);
      return;
    }
    const success = await switchHousehold(householdId);
    if (success) {
      void router.replace(`/households/${encodeURIComponent(householdId)}/today`);
    }
    setSwitcherOpen(false);
  }, [currentHouseholdId, switchHousehold, router]);

  // AccessChanged state
  if (viewState === 'accessChanged') {
    return (
      <AppShell accessibilityLabel="家庭访问权已变化">
        <AccessChangedPanel
          hasOtherHouseholds={households.length > 0}
          {...(accessChangedHouseholdName === undefined ? {} : { householdName: accessChangedHouseholdName })}
          onChooseOther={() => { void refreshHouseholds().then(() => router.replace('/households')); }}
          onCreateNew={() => { void router.replace('/household-handoff'); }}
        />
      </AppShell>
    );
  }

  if (householdId === undefined || householdId === '') {
    return (
      <AppShell accessibilityLabel="页面未找到">
        <Stack gap={4}>
          <Text>这个页面暂时无法访问。</Text>
        </Stack>
      </AppShell>
    );
  }

  return (
    <>
      <AppShell accessibilityLabel="今日视图" refreshing={refreshing} onRefresh={handleRefresh} title="今日视图" showProfile>
      <Stack gap={4}>
        {/* Header */}
        <HouseholdHeader
          householdName={currentHousehold?.name ?? ''}
          onOpenSwitcher={() => setSwitcherOpen(true)}
        />

        {/* Date label */}
        <Text variant="label">{dateLabel}</Text>

        {/* Loading */}
        {loading && (
          <View style={{ alignItems: 'center', paddingVertical: activeTheme.spacing[6] }}>
            <ActivityIndicator color={activeTheme.colors.coral} />
          </View>
        )}

        {/* Error */}
        {error !== null && (
          <View style={{
            backgroundColor: activeTheme.colors.destructiveSoft,
            padding: activeTheme.spacing[4],
            borderRadius: activeTheme.borderRadii.md,
          }}>
            <Text variant="bodySm" color="destructive">{error}</Text>
            <Pressable
              onPress={() => void fetchData()}
              hitSlop={activeTheme.spacing[3]}
              accessibilityLabel="重试加载今日数据"
              style={{ marginTop: activeTheme.spacing[2], alignSelf: 'flex-start' }}
            >
              <Text variant="label" color="coral">重试</Text>
            </Pressable>
          </View>
        )}

        {!loading && error === null && (
          <>
            {/* Overdue tasks banner */}
            {overdueTasks.length > 0 && (
              <View>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: activeTheme.spacing[2],
                  marginBottom: activeTheme.spacing[2],
                }}>
                  <TriangleAlert size={16} color={activeTheme.colors.destructive} />
                  <Text variant="label" color="destructive">
                    逾期任务 ({overdueTasks.length})
                  </Text>
                </View>
                <Stack gap={2}>
                  {overdueTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      assigneeNames={(task.assigneeIds ?? []).map((uid) => memberNameMap.get(uid) ?? '未知成员')}
                      onPress={handleTaskPress}
                      onStatusChange={handleTaskStatusChange}
                      statusChanging={statusChangingTaskId === task.id}
                    />
                  ))}
                </Stack>
              </View>
            )}

            {/* Today's events */}
            <View>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: activeTheme.spacing[2],
                marginBottom: activeTheme.spacing[2],
              }}>
                <Calendar size={16} color={activeTheme.colors.coral} />
                <Text variant="label">
                  今日事件 ({events.length})
                </Text>
              </View>
              {events.length === 0 ? (
                <Text variant="bodySm" color="inkMuted">
                  今天没有安排事件。
                </Text>
              ) : (
                <Stack gap={2}>
                  {events.map((event) => (
                    <EventCard key={event.id} event={event} onPress={handleEventPress} />
                  ))}
                </Stack>
              )}
            </View>

            {/* Today's tasks */}
            {todayTasks.length > 0 && (
              <View>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: activeTheme.spacing[2],
                  marginBottom: activeTheme.spacing[2],
                }}>
                  <Clock size={16} color={activeTheme.colors.teal} />
                  <Text variant="label">
                    今日待办 ({todayTasks.length})
                  </Text>
                </View>
                <Stack gap={2}>
                  {todayTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      assigneeNames={(task.assigneeIds ?? []).map((uid) => memberNameMap.get(uid) ?? '未知成员')}
                      onPress={handleTaskPress}
                      onStatusChange={handleTaskStatusChange}
                      statusChanging={statusChangingTaskId === task.id}
                    />
                  ))}
                </Stack>
              </View>
            )}

            {/* Approaching deadlines — always shown so the user knows this section exists */}
            <View>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: activeTheme.spacing[2],
                marginBottom: activeTheme.spacing[2],
              }}>
                <Hourglass size={16} color={activeTheme.colors.coral} />
                <Text variant="label">
                  临近截止日期 ({approachingTasks.length})
                </Text>
              </View>
              {approachingTasks.length === 0 ? (
                <Text variant="bodySm" color="inkMuted">
                  未来 7 天内没有到期的任务。
                </Text>
              ) : (
                <Stack gap={2}>
                  {approachingTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      assigneeNames={(task.assigneeIds ?? []).map((uid) => memberNameMap.get(uid) ?? '未知成员')}
                      onPress={handleTaskPress}
                      onStatusChange={handleTaskStatusChange}
                      statusChanging={statusChangingTaskId === task.id}
                    />
                  ))}
                </Stack>
              )}
            </View>

            {/* Other upcoming tasks (more than 7 days away) */}
            {otherUpcomingTasks.length > 0 && (
              <View>
                <Text variant="label" color="inkMuted" style={{ marginBottom: activeTheme.spacing[2] }}>
                  稍后待办 ({otherUpcomingTasks.length})
                </Text>
                <Stack gap={2}>
                  {otherUpcomingTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      assigneeNames={(task.assigneeIds ?? []).map((uid) => memberNameMap.get(uid) ?? '未知成员')}
                      onPress={handleTaskPress}
                      onStatusChange={handleTaskStatusChange}
                      statusChanging={statusChangingTaskId === task.id}
                    />
                  ))}
                </Stack>
              </View>
            )}

            {/* Empty state */}
            {events.length === 0 && overdueTasks.length === 0 && todayTasks.length === 0 && otherUpcomingTasks.length === 0 && (
              <View style={{
                alignItems: 'center',
                paddingVertical: activeTheme.spacing[8],
              }}>
                <Text variant="bodySm" color="inkMuted">
                  今天没有待办事项 🎉
                </Text>
              </View>
            )}
          </>
        )}
      </Stack>
    </AppShell>

    <HouseholdSwitcher
      currentHouseholdId={currentHouseholdId}
      households={households}
      onCreateNew={() => {
        void router.push('/households/new');
        setSwitcherOpen(false);
      }}
      onClose={() => setSwitcherOpen(false)}
      onSelect={(hid) => { void handleSwitch(hid); }}
      visible={switcherOpen}
    />
  </>  );
}
