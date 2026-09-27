import { FloatingCreateButton } from '../../../../src/ui/floating-create-button';
import { useContentDelete } from '../../../../src/features/content/use-content-delete';
import { rememberRouteTrigger } from '../../../../src/platform/overlays/route-trigger';
import { useWorkspaceState } from '../../../../src/ui/workspace-state';
import { PageIntro, TodaySummary } from '../../../../src/ui/page-intro';
import { formatDate } from '../../../../src/ui/date-values';
import { HouseholdNavigation } from '../../../../src/ui/household-navigation';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { EventResponseDto, TaskResponseDto, GetHouseholdMemberDto } from '@muchakucha/api-client';
import Calendar from 'lucide-react-native/icons/calendar';
import Clock from 'lucide-react-native/icons/clock';
import Hourglass from 'lucide-react-native/icons/hourglass';
import Inbox from 'lucide-react-native/icons/inbox';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';

import { sessionApiClient, sessionTransport } from '../../../../src/features/auth/session-runtime';
import { useTaskCompletion } from '../../../../src/features/tasks/use-task-completion';
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
import { Button, EmptyState, LoadError, LoadingState, Stack, Text } from '../../../../src/ui/primitives';
import type { Theme } from '../../../../src/ui/theme';

function todayIso(): string {
  return toDateIso(new Date());
}

function isToday(iso: string | null): boolean {
  if (iso === null || iso === '') return false;
  return toDateIso(new Date(iso)) === todayIso();
}

/**
 * `retainCompletedId` keeps one just-completed task in its bucket so the undo
 * offered on its card survives the refetch that follows the write. Without it
 * the card vanishes the instant it is completed, taking the undo with it.
 */
export function partitionTodayTasks(tasks: TaskResponseDto[], retainCompletedId: string | null = null) {
  const overdueTasks: TaskResponseDto[] = [];
  const todayTasks: TaskResponseDto[] = [];
  const unscheduledTasks: TaskResponseDto[] = [];
  const approachingTasks: TaskResponseDto[] = [];
  const otherUpcomingTasks: TaskResponseDto[] = [];

  for (const task of tasks) {
    const retained = task.id === retainCompletedId && task.status === 'completed';
    if (!retained && (task.status === 'completed' || task.status === 'cancelled')) continue;
    const dueDate = task.dueDate ?? null;
    // A task with no due date is unscheduled, not due today. Folding the two
    // together presented "no date" as "due today" and inflated the count the
    // summary reports, so the absence of a date is decided first and never
    // relies on how the date helpers treat null.
    if (dueDate === null || dueDate === '') {
      unscheduledTasks.push(task);
    } else if (isOverdue(dueDate)) {
      overdueTasks.push(task);
    } else if (isToday(dueDate)) {
      todayTasks.push(task);
    } else if (isApproachingDeadline(dueDate, 7)) {
      approachingTasks.push(task);
    } else {
      otherUpcomingTasks.push(task);
    }
  }

  // Only future reminders collapse a series. Today's work and missed
  // occurrences remain independently actionable. Select by due date, since
  // the API orders by priority before date and individual instances can differ.
  const nearestByRule = new Map<string, TaskResponseDto>();
  for (const task of [...approachingTasks, ...otherUpcomingTasks]) {
    if (task.recurrenceRuleId == null) continue;
    const previous = nearestByRule.get(task.recurrenceRuleId);
    if (previous === undefined || new Date(task.dueDate!).getTime() < new Date(previous.dueDate!).getTime()) {
      nearestByRule.set(task.recurrenceRuleId, task);
    }
  }
  const isNearest = (task: TaskResponseDto) =>
    task.recurrenceRuleId == null || nearestByRule.get(task.recurrenceRuleId)?.id === task.id;

  return {
    overdueTasks, todayTasks, unscheduledTasks,
    approachingTasks: approachingTasks.filter(isNearest),
    otherUpcomingTasks: otherUpcomingTasks.filter(isNearest),
  };
}

export default function TodayRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const deleteTask = useContentDelete('tasks');
  const deleteEvent = useContentDelete('events');
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
  const loaded = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [, setCalendarDate] = useWorkspaceState<string | null>(`view:${id}:events:selectedDateIso`, todayIso());
  const [showUpcoming, setShowUpcoming] = useWorkspaceState(`view:${id}:today:upcoming`, false);
  const [allOverdue, setAllOverdue] = useWorkspaceState(`view:${id}:today:allOverdue`, false);
  const [allUnscheduled, setAllUnscheduled] = useWorkspaceState(`view:${id}:today:allUnscheduled`, false);

  const householdId = id ?? currentHouseholdId;
  const currentHousehold = households.find((h) => h.id === (id ?? currentHouseholdId)) ?? null;

  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      map.set(m.userId, m.displayName);
    }
    return map;
  }, [members]);

  const fetchData = useCallback(async () => {
    if (householdId === undefined || householdId === '') return;
    if (!loaded.current) setLoading(true);
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

      loaded.current = true;
      setEvents(eventsResult.events);
      setMembers(householdResult.members);
      setTasks(tasksResult.tasks);
    } catch (err) {
      setError(loaded.current ? '刷新失败，仍显示上次的安排。请检查网络后重试。' : '无法加载今日数据，请检查网络连接后重试。');
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  const completion = useTaskCompletion(householdId, fetchData);

  // Split tasks into groups
  const { overdueTasks, todayTasks, unscheduledTasks, approachingTasks, otherUpcomingTasks } = useMemo(
    () => partitionTodayTasks(tasks, completion.undoTaskId),
    [tasks, completion.undoTaskId],
  );

  const previewTasks = (items: TaskResponseDto[], expanded: boolean) => expanded
    ? items
    : items.filter((task, index) => index < 3 || task.id === completion.undoTaskId);

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
      rememberRouteTrigger();
      void router.push(
        `/households/${encodeURIComponent(householdId!)}/events/${encodeURIComponent(event.id)}`,
      );
    },
    [router, householdId],
  );

  const handleTaskPress = useCallback(
    (task: TaskResponseDto) => {
      rememberRouteTrigger();
      void router.push(
        `/households/${encodeURIComponent(householdId!)}/tasks/${encodeURIComponent(task.id)}`,
      );
    },
    [router, householdId],
  );


  const dateLabel = useMemo(() => formatDate(new Date(), { weekday: true }), []);

  const handleSwitch = useCallback(async (householdId: string) => {
    if (householdId === (id ?? currentHouseholdId)) {
      setSwitcherOpen(false);
      return;
    }
    const success = await switchHousehold(householdId);
    if (success) {
      void router.replace(`/households/${encodeURIComponent(householdId)}/today`);
    }
    setSwitcherOpen(false);
  }, [id, currentHouseholdId, switchHousehold, router]);

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
      <AppShell accessibilityLabel="今日视图" refreshing={refreshing} onRefresh={handleRefresh} title="今日视图" showProfile headerContent={<HouseholdHeader
          householdName={currentHousehold?.name ?? ''}
          onOpenSwitcher={() => setSwitcherOpen(true)}
        />} footer={<HouseholdNavigation householdId={householdId} active="today" />} floatingAction={viewState === 'ready' ? <FloatingCreateButton actions={[
        { kind: 'events', label: '创建日程', onPress: () => { setCalendarDate(todayIso()); rememberRouteTrigger(); router.push(`/households/${encodeURIComponent(householdId)}/events/new`); } },
        { kind: 'tasks', label: '创建任务', onPress: () => { rememberRouteTrigger(); router.push(`/households/${encodeURIComponent(householdId)}/tasks/new`); } },
        { kind: 'notes', label: '创建笔记', onPress: () => { rememberRouteTrigger(); router.push(`/households/${encodeURIComponent(householdId)}/notes/new`); } },
      ]} /> : null}>
      <Stack gap={4}>
        <PageIntro title="今日" action={<Text variant="label" color="inkMuted">{dateLabel}</Text>} />
        {!loading && error === null ? <TodaySummary events={events.length} tasks={todayTasks.length} overdue={overdueTasks.length} /> : null}

        {/* Loading */}
        {loading && <LoadingState label="正在加载今日安排" />}

        {/* Error */}
        {error !== null && <LoadError message={error} onRetry={() => void fetchData()} retryAccessibilityLabel="重试加载今日数据" />}

        {!loading && (error === null || loaded.current) && (
          <>
            {/* Empty primary groups */}
            {events.length === 0 && todayTasks.length === 0 ? <EmptyState message="今天没有待处理安排。" /> : null}
            {/* Today's events */}
            {events.length > 0 ? <View>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: activeTheme.spacing[2],
                marginBottom: activeTheme.spacing[2],
              }}>
                <Calendar size={16} color={activeTheme.colors.coral} />
                <Text accessibilityRole="header" aria-level={2} variant="section">
                  今日日程（{events.length}）
                </Text>
              </View>
              <Stack gap={2}>
                {events.map((event) => (
                  <EventCard key={event.id} event={event} onPress={handleEventPress} onDelete={deleteEvent(event)} />
                ))}
              </Stack>
            </View> : null}

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
                  <Text accessibilityRole="header" aria-level={2} variant="section">
                  今日待办（{todayTasks.length}）
                  </Text>
                </View>
                <Stack gap={2}>
                  {todayTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      assigneeNames={(task.assigneeIds ?? []).map((uid) => memberNameMap.get(uid) ?? '未知成员')}
                      onPress={handleTaskPress} onDelete={deleteTask(task)}
                      {...completion.cardProps(task)}
                    />
                  ))}
                </Stack>
              </View>
            )}

            {overdueTasks.length > 0 && (
              <View>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: activeTheme.spacing[2],
                  marginBottom: activeTheme.spacing[2],
                }}>
                  <TriangleAlert size={16} color={activeTheme.colors.destructive} />
                  <Text accessibilityRole="header" aria-level={2} variant="section" color="destructive">
                  逾期任务（{overdueTasks.length}）
                  </Text>
                </View>
                <Stack gap={2}>
                  {previewTasks(overdueTasks, allOverdue).map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      assigneeNames={(task.assigneeIds ?? []).map((uid) => memberNameMap.get(uid) ?? '未知成员')}
                      onPress={handleTaskPress} onDelete={deleteTask(task)}
                      {...completion.cardProps(task)}
                    />
                  ))}
                </Stack>
                {overdueTasks.length > 3 ? <Button label={allOverdue ? '收起逾期任务' : `查看全部逾期任务（${overdueTasks.length}）`} tone="secondary" onPress={() => setAllOverdue(value => !value)} /> : null}
              </View>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showUpcoming }}
              aria-expanded={showUpcoming}
              onPress={() => setShowUpcoming((value) => !value)}
              style={{ minHeight: activeTheme.controlSizes.touchTarget, justifyContent: 'center' }}
            >
              <Text variant="label" color="link">
                {showUpcoming ? '收起后续安排' : `查看后续安排（${approachingTasks.length + otherUpcomingTasks.length}）`}
              </Text>
            </Pressable>
            {showUpcoming ? <>
            {/* Upcoming work is secondary to today's actions. */}
            <View>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: activeTheme.spacing[2],
                marginBottom: activeTheme.spacing[2],
              }}>
                <Hourglass size={16} color={activeTheme.colors.coral} />
                <Text accessibilityRole="header" aria-level={2} variant="section">
                  临近截止日期（{approachingTasks.length}）
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
                      onPress={handleTaskPress} onDelete={deleteTask(task)}
                      {...completion.cardProps(task)}
                    />
                  ))}
                </Stack>
              )}
            </View>

            {/* Other upcoming tasks (more than 7 days away) */}
            {otherUpcomingTasks.length > 0 && (
              <View>
                <Text variant="label" color="inkMuted" style={{ marginBottom: activeTheme.spacing[2] }}>
                  稍后待办（{otherUpcomingTasks.length}）
                </Text>
                <Stack gap={2}>
                  {otherUpcomingTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      assigneeNames={(task.assigneeIds ?? []).map((uid) => memberNameMap.get(uid) ?? '未知成员')}
                      onPress={handleTaskPress} onDelete={deleteTask(task)}
                      {...completion.cardProps(task)}
                    />
                  ))}
                </Stack>
              </View>
            )}

            </> : null}

            {/* A bounded preview keeps unscheduled work reachable without burying the day. */}
            {unscheduledTasks.length > 0 && (
              <View>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: activeTheme.spacing[2],
                  marginBottom: activeTheme.spacing[2],
                }}>
                  <Inbox size={16} color={activeTheme.colors.inkMuted} />
                  <Text accessibilityRole="header" aria-level={2} variant="section">
                  待安排（{unscheduledTasks.length}）
                  </Text>
                </View>
                <Stack gap={2}>
                  {previewTasks(unscheduledTasks, allUnscheduled).map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      assigneeNames={(task.assigneeIds ?? []).map((uid) => memberNameMap.get(uid) ?? '未知成员')}
                      onPress={handleTaskPress} onDelete={deleteTask(task)}
                      {...completion.cardProps(task)}
                    />
                  ))}
                </Stack>
                {unscheduledTasks.length > 3 ? <Button label={allUnscheduled ? '收起待安排' : `查看全部待安排（${unscheduledTasks.length}）`} tone="secondary" onPress={() => setAllUnscheduled(value => !value)} /> : null}
              </View>
            )}


          </>
        )}
      </Stack>
    </AppShell>

    <HouseholdSwitcher
      currentHouseholdId={id ?? currentHouseholdId}
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
