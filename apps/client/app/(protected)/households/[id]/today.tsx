import { useOpenWindowItem } from '../../../../src/ui/route-window';
import { FloatingCreateButton } from '../../../../src/ui/floating-create-button';
import { useContentDelete, useContentEdit } from '../../../../src/features/content/use-content-delete';
import { rememberRouteTrigger } from '../../../../src/platform/overlays/route-trigger';
import { useWorkspaceState } from '../../../../src/ui/workspace-state';
import { PageIntro } from '../../../../src/ui/page-intro';
import { formatDate, formatWeekday, toTimeValue } from '../../../../src/ui/date-values';
import { GroupLabel, ListGroup, NowMarker } from '../../../../src/ui/list-group';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import type { EventResponseDto, TaskResponseDto, GetHouseholdMemberDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../src/features/auth/session-runtime';
import { useTaskCompletion } from '../../../../src/features/tasks/use-task-completion';
import { useHouseholdContext } from '../../../../src/features/households/household-context';
import { HouseholdScreen } from '../../../../src/features/households/household-screen';
import { EventCard } from '../../../../src/features/events/event-card';
import { TaskCard } from '../../../../src/features/tasks/task-card';
import { toDateIso } from '../../../../src/features/events/calendar-utils';
import { isApproachingDeadline, isOverdue } from '../../../../src/features/tasks/task-utils';
import { Button, EmptyState, LoadError, LoadingState, Stack, Text } from '../../../../src/ui/primitives';
import { theme } from '../../../../src/ui/theme';

function todayIso(): string {
  return toDateIso(new Date());
}

function isToday(iso: string | null): boolean {
  if (iso === null || iso === '') return false;
  return toDateIso(new Date(iso)) === todayIso();
}

/**
 * `retainCompletedId` keeps one just-completed task in its bucket while the
 * top undo notice is open, so the card the person just checked stays in place
 * until they undo or dismiss it instead of vanishing with the refetch.
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
  const openTaskId = useOpenWindowItem('taskId');
  const openEventId = useOpenWindowItem('eventId');
  const deleteTask = useContentDelete('tasks');
  const editTask = useContentEdit('tasks');
  const deleteEvent = useContentDelete('events');
  const editEvent = useContentEdit('events');
  const { width } = useWindowDimensions();
  const { viewState, currentHouseholdId } = useHouseholdContext();

  const [events, setEvents] = useState<EventResponseDto[]>([]);
  const [tasks, setTasks] = useState<TaskResponseDto[]>([]);
  const [members, setMembers] = useState<GetHouseholdMemberDto[]>([]);
  const [loading, setLoading] = useState(true);
  const loaded = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [, setCalendarDate] = useWorkspaceState<string | null>(`view:${id}:events:selectedDateIso`, todayIso());
  const [showUpcoming, setShowUpcoming] = useWorkspaceState(`view:${id}:today:upcoming`, false);
  const [allOverdue, setAllOverdue] = useWorkspaceState(`view:${id}:today:allOverdue`, false);
  const [allUnscheduled, setAllUnscheduled] = useWorkspaceState(`view:${id}:today:allUnscheduled`, false);
  const now = useMinuteClock();

  const householdId = id ?? currentHouseholdId;

  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      map.set(m.userId, m.displayName);
    }
    return map;
  }, [members]);

  const fetchData = useCallback(async () => {
    if (householdId === undefined || householdId === null || householdId === '') return;
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

  const completion = useTaskCompletion(householdId ?? undefined, fetchData);

  const { overdueTasks, todayTasks, unscheduledTasks, approachingTasks, otherUpcomingTasks } = useMemo(
    () => partitionTodayTasks(tasks, completion.undoTaskId),
    [tasks, completion.undoTaskId],
  );
  const day = useMemo(() => arrangeDay(events, todayTasks), [events, todayTasks]);

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
  // Leaving the page (a detail window, another tab) closes the undo notice.
  const { dismissUndo } = completion;
  useFocusEffect(useCallback(() => dismissUndo, [dismissUndo]));

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

  const create = (kind: 'events' | 'tasks' | 'notes') => () => {
    if (kind === 'events') setCalendarDate(todayIso());
    rememberRouteTrigger();
    router.push(`/households/${encodeURIComponent(householdId!)}/${kind}/new`);
  };

  const taskRow = (task: TaskResponseDto, options: { time?: string; showDue?: boolean } = {}) => (
    <TaskCard
      key={task.id}
      task={task}
      assignees={(task.assigneeIds ?? []).map((uid) => ({ id: uid, name: memberNameMap.get(uid) ?? '未知成员' }))}
      onPress={handleTaskPress} onEdit={editTask(task)} onDelete={deleteTask(task)}
      {...(options.time === undefined ? {} : { time: options.time })}
      showDue={options.showDue ?? true}
      selected={task.id === openTaskId}
      {...completion.cardProps(task)}
    />
  );
  const eventRow = (event: EventResponseDto, timeColumn: boolean) => (
    <EventCard key={event.id} event={event} withinDay timeColumn={timeColumn} selected={event.id === openEventId} onPress={handleEventPress} onEdit={editEvent(event)} onDelete={deleteEvent(event)} />
  );

  const wide = width >= theme.layout.navigationBreakpoint;
  const ready = !loading && (error === null || loaded.current);
  const nothingToday = events.length === 0 && todayTasks.length === 0;
  const upcomingCount = approachingTasks.length + otherUpcomingTasks.length;
  const nowIndex = day.timeline.findIndex(entry => entry.at > now.minutes);

  const summary = (
    <Text variant="bodySm">
      {formatWeekday(now.date)}
      {ready ? ` · ${events.length} 个日程 · ${todayTasks.length} 件待办` : ''}
      {ready && overdueTasks.length > 0 ? <Text variant="bodySm" color="accent">{` · ${overdueTasks.length} 件逾期`}</Text> : null}
    </Text>
  );

  const overdueGroup = overdueTasks.length > 0 ? (
    <View>
      <GroupLabel tone="accent">{`逾期任务（${overdueTasks.length}）`}</GroupLabel>
      <ListGroup>{previewTasks(overdueTasks, allOverdue).map(task => taskRow(task))}</ListGroup>
      {overdueTasks.length > 3 ? <MoreButton label={allOverdue ? '收起逾期任务' : `查看全部逾期任务（${overdueTasks.length}）`} expanded={allOverdue} onPress={() => setAllOverdue(value => !value)} /> : null}
    </View>
  ) : null;

  const allDayGroup = day.allDay.length > 0 ? (
    <View>
      <GroupLabel>{`全天（${day.allDay.length}）`}</GroupLabel>
      <ListGroup>{day.allDay.map(entry => entry.kind === 'event' ? eventRow(entry.event, false) : taskRow(entry.task, { showDue: false }))}</ListGroup>
    </View>
  ) : null;

  const timelineGroup = day.timeline.length > 0 ? (
    <View>
      <GroupLabel>{`时间线（${day.timeline.length}）`}</GroupLabel>
      <ListGroup>
        {day.timeline.flatMap((entry, index) => [
          ...(index === nowIndex ? [<NowMarker key="now" time={toTimeValue(now.date)} />] : []),
          entry.kind === 'event' ? eventRow(entry.event, true) : taskRow(entry.task, { time: toTimeValue(new Date(entry.task.dueDate!)), showDue: false }),
        ])}
        {nowIndex === -1 ? <NowMarker key="now" time={toTimeValue(now.date)} /> : null}
      </ListGroup>
    </View>
  ) : null;

  const unscheduledGroup = unscheduledTasks.length > 0 ? (
    <View>
      {/* A bounded preview keeps unscheduled work reachable without burying the day. */}
      <GroupLabel>{`待安排（${unscheduledTasks.length}）`}</GroupLabel>
      <ListGroup>{previewTasks(unscheduledTasks, allUnscheduled).map(task => taskRow(task))}</ListGroup>
      {unscheduledTasks.length > 3 ? <MoreButton label={allUnscheduled ? '收起待安排' : `查看全部待安排（${unscheduledTasks.length}）`} expanded={allUnscheduled} onPress={() => setAllUnscheduled(value => !value)} /> : null}
    </View>
  ) : null;

  // Hidden when nothing is coming up: a toggle that reveals zero items is noise.
  const upcomingGroup = upcomingCount > 0 ? (
    <Stack gap={4}>
      <MoreButton label={showUpcoming ? '收起后续安排' : `查看后续安排（${upcomingCount}）`} expanded={showUpcoming} onPress={() => setShowUpcoming(value => !value)} />
      {showUpcoming ? <>
        <View>
          <GroupLabel>{`临近截止日期（${approachingTasks.length}）`}</GroupLabel>
          {approachingTasks.length === 0
            ? <Text variant="bodySm" style={{ paddingHorizontal: theme.spacing[1] }}>未来 7 天内没有到期的任务。</Text>
            : <ListGroup>{approachingTasks.map(task => taskRow(task))}</ListGroup>}
        </View>
        {otherUpcomingTasks.length > 0 ? (
          <View>
            <GroupLabel>{`稍后待办（${otherUpcomingTasks.length}）`}</GroupLabel>
            <ListGroup>{otherUpcomingTasks.map(task => taskRow(task))}</ListGroup>
          </View>
        ) : null}
      </> : null}
    </Stack>
  ) : null;

  const primary = (
    <Stack gap={6}>
      {overdueGroup}
      {nothingToday ? <EmptyState title="今天很清闲" message="今天没有日程，也没有到期的待办。" /> : null}
      {allDayGroup}
      {timelineGroup}
    </Stack>
  );
  const secondary = unscheduledGroup || upcomingGroup ? <Stack gap={6}>{unscheduledGroup}{upcomingGroup}</Stack> : null;

  return (
    <HouseholdScreen
      active="today"
      accessibilityLabel="今日视图"
      notice={completion.undoNotice}
      refreshing={refreshing}
      onRefresh={handleRefresh}
      floatingAction={<FloatingCreateButton actions={[
        { kind: 'events', label: '创建日程', onPress: create('events') },
        { kind: 'tasks', label: '创建任务', onPress: create('tasks') },
        { kind: 'notes', label: '创建笔记', onPress: create('notes') },
      ]} />}
    >
      <Stack gap={6}>
        <PageIntro title={formatDate(now.date)} subtitle={summary} />

        {loading ? <LoadingState label="正在加载今日安排" /> : null}
        {error !== null ? <LoadError message={error} onRetry={() => void fetchData()} retryAccessibilityLabel="重试加载今日数据" /> : null}

        {ready && viewState !== 'resolving' ? (
          wide && secondary
            ? <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing[8] }}>
                <View style={{ flex: 3, minWidth: 0 }}>{primary}</View>
                <View style={{ flex: 2, minWidth: 0 }}>{secondary}</View>
              </View>
            : <Stack gap={6}>{primary}{secondary}</Stack>
        ) : null}
      </Stack>
    </HouseholdScreen>
  );
}

/** A quiet compact toggle under a group, such as 「查看全部待安排（5）」. */
function MoreButton({ label, expanded, onPress }: { label: string; expanded: boolean; onPress(): void }) {
  return <Button label={label} tone="secondary" size="compact" expanded={expanded} onPress={onPress} style={{ marginTop: theme.spacing[2], alignSelf: 'flex-start' }} />;
}

type DayEntry =
  | { kind: 'event'; at: number; event: EventResponseDto }
  | { kind: 'task'; at: number; task: TaskResponseDto };

const minutesOf = (iso: string): number => {
  const date = new Date(iso);
  return date.getHours() * 60 + date.getMinutes();
};

/**
 * Lays out today: all-day events, events that began before today and tasks due
 * today without a clock time go under 全天; everything with a time today runs
 * in one timeline, events and tasks together, earliest first.
 */
export function arrangeDay(events: EventResponseDto[], todayTasks: TaskResponseDto[]): { allDay: DayEntry[]; timeline: DayEntry[] } {
  const allDay: DayEntry[] = [];
  const timeline: DayEntry[] = [];
  for (const event of events) {
    const entry = { kind: 'event' as const, at: minutesOf(event.startTime), event };
    if (event.allDay || toDateIso(new Date(event.startTime)) !== todayIso()) allDay.push(entry);
    else timeline.push(entry);
  }
  for (const task of todayTasks) {
    const at = minutesOf(task.dueDate!);
    // A due date without a time is stored as local midnight.
    (at === 0 ? allDay : timeline).push({ kind: 'task', at, task });
  }
  timeline.sort((a, b) => a.at - b.at);
  return { allDay, timeline };
}

/** The current time, refreshed each minute so the now marker keeps its place. */
function useMinuteClock(): { date: Date; minutes: number } {
  const [date, setDate] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setDate(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return { date, minutes: date.getHours() * 60 + date.getMinutes() };
}
