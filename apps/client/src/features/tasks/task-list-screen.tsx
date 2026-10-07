import { FloatingCreateButton } from '../../ui/floating-create-button';
import { useContentDelete, useContentEdit } from '../content/use-content-delete';
import { FilterOptions } from '../../ui/filter-options';
import { AppDialog } from '../../ui/app-dialog';
import { rememberRouteTrigger } from '../../platform/overlays/route-trigger';
import { PageIntro } from '../../ui/page-intro';
import { useWorkspaceState } from '../../ui/workspace-state';
import { GroupLabel, ListGroup } from '../../ui/list-group';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import type { TaskResponseDto, GetHouseholdMemberDto } from '@muchakucha/api-client';
import { FilterActions, FilterButton } from '../../ui/filter-controls';

import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { useTaskCompletion } from './use-task-completion';
import { useHouseholdContext } from '../households/household-context';
import { HouseholdScreen } from '../households/household-screen';
import { mergeLabels, useHouseholdLabels } from '../labels/use-household-labels';
import {
  applyRecurringFilter,
  classifyGenerationWindow,
  GENERATION_BEHIND_BODY,
  GENERATION_BEHIND_HEADING,
  RECURRING_EMPTY_TASKS,
  RECURRING_FILTER_GROUP_LABEL,
  RECURRING_FILTERS,
  recurringFilterAccessibilityLabel,
  type RecurringFilterKey,
} from '../recurrence/recurring-filter';
import { TaskCard } from './task-card';
import { isOverdue } from './task-utils';
import { toDateValue } from '../../ui/date-values';
import { Button, EmptyState, LoadError, LoadingState, Stack, StatusPanel } from '../../ui/primitives';

type FilterKey = 'all' | 'pending' | 'in_progress' | 'completed';
type PriorityFilterKey = 'all' | 'low' | 'medium' | 'high' | 'urgent';

// Status is the everyday question, so it sits on the page; the rest waits in 筛选.
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'pending', label: '待办' },
  { key: 'in_progress', label: '进行中' },
  { key: 'completed', label: '已完成' },
  { key: 'all', label: '全部' },
];

const PRIORITY_FILTERS: { key: PriorityFilterKey; label: string }[] = [
  { key: 'all', label: '全部优先级' },
  { key: 'low', label: '低' },
  { key: 'medium', label: '中' },
  { key: 'high', label: '高' },
  { key: 'urgent', label: '紧急' },
];

type TaskGroup = { key: string; label: string; tone: 'muted' | 'accent'; tasks: TaskResponseDto[] };

/**
 * Open work grouped by when it is due — 逾期, 今天, 之后, then 待安排 for tasks
 * without a date — so the list reads like a plan. Finished work is one group.
 */
export function groupTasksByDue(tasks: TaskResponseDto[], status: FilterKey, today: string): TaskGroup[] {
  if (status === 'completed') return [{ key: 'completed', label: `已完成（${tasks.length}）`, tone: 'muted', tasks }];
  const overdue: TaskResponseDto[] = [];
  const dueToday: TaskResponseDto[] = [];
  const later: TaskResponseDto[] = [];
  const undated: TaskResponseDto[] = [];
  const closed: TaskResponseDto[] = [];
  for (const task of tasks) {
    const due = task.dueDate ?? null;
    if (task.status === 'completed' || task.status === 'cancelled') closed.push(task);
    else if (due === null || due === '') undated.push(task);
    else if (isOverdue(due)) overdue.push(task);
    else if (toDateValue(new Date(due)) === today) dueToday.push(task);
    else later.push(task);
  }
  const byDue = (a: TaskResponseDto, b: TaskResponseDto) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime();
  return [
    { key: 'overdue', label: `逾期（${overdue.length}）`, tone: 'accent' as const, tasks: overdue.sort(byDue) },
    { key: 'today', label: `今天（${dueToday.length}）`, tone: 'muted' as const, tasks: dueToday.sort(byDue) },
    { key: 'later', label: `之后（${later.length}）`, tone: 'muted' as const, tasks: later.sort(byDue) },
    { key: 'undated', label: `待安排（${undated.length}）`, tone: 'muted' as const, tasks: undated },
    { key: 'closed', label: `已结束（${closed.length}）`, tone: 'muted' as const, tasks: closed },
  ].filter(group => group.tasks.length > 0);
}

export default function TaskListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const deleteTask = useContentDelete('tasks');
  const editTask = useContentEdit('tasks');
  const { currentHouseholdId } = useHouseholdContext();

  const [tasks, setTasks] = useState<TaskResponseDto[]>([]);
  const [materializedThrough, setMaterializedThrough] = useState<string | null>(null);
  const [members, setMembers] = useState<GetHouseholdMemberDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useWorkspaceState<FilterKey>(`view:${id}:tasks:filter`, 'pending');
  const [priorityFilter, setPriorityFilter] = useWorkspaceState<PriorityFilterKey>(`view:${id}:tasks:priorityFilter`, 'all');
  const [assigneeFilter, setAssigneeFilter] = useWorkspaceState<string>(`view:${id}:tasks:assigneeFilter`, 'all');
  const [labelFilter, setLabelFilter] = useWorkspaceState<string>(`view:${id}:tasks:labelFilter`, 'all');
  const [recurringFilter, setRecurringFilter] = useWorkspaceState<RecurringFilterKey>(`view:${id}:tasks:recurringFilter`, 'all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterTrigger = useRef<View>(null);
  const loaded = useRef(false);

  const householdId = id ?? currentHouseholdId;

  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      map.set(m.userId, m.displayName);
    }
    return map;
  }, [members]);

  // Extract unique labels from loaded tasks
  const seenLabels = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; color: string }>();
    for (const t of tasks) {
      for (const l of t.labels ?? []) {
        if (!seen.has(l.id)) {
          seen.set(l.id, { id: l.id, name: l.name, color: l.color });
        }
      }
    }
    return [...seen.values()];
  }, [tasks]);
  const householdLabels = useHouseholdLabels(householdId);
  const availableLabels = useMemo(() => mergeLabels(householdLabels, seenLabels), [householdLabels, seenLabels]);

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (filter !== 'all') {
      result = result.filter((t) => t.status === filter);
    }
    if (priorityFilter !== 'all') {
      result = result.filter((t) => t.priority === priorityFilter);
    }
    if (assigneeFilter !== 'all') {
      result = result.filter((t) => (t.assigneeIds ?? []).includes(assigneeFilter));
    }
    if (labelFilter !== 'all') {
      result = result.filter((t) => (t.labels ?? []).some((l) => l.id === labelFilter));
    }
    result = applyRecurringFilter(result, recurringFilter);
    return result;
  }, [tasks, filter, priorityFilter, assigneeFilter, labelFilter, recurringFilter]);

  // Status shows on the page itself, so the 筛选 count covers only what it hides.
  const activeFilterCount = [
    priorityFilter !== 'all',
    assigneeFilter !== 'all',
    labelFilter !== 'all',
    recurringFilter !== 'all',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setPriorityFilter('all'); setAssigneeFilter('all'); setLabelFilter('all'); setRecurringFilter('all');
  };

  const assigneeOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: { userId: string; displayName: string }[] = [];
    for (const m of members) {
      if (!seen.has(m.userId)) {
        seen.add(m.userId);
        options.push({ userId: m.userId, displayName: m.displayName });
      }
    }
    return options;
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
      const [tasksResult, householdResult] = await Promise.all([
        sessionApiClient.listTasks(token, householdId),
        sessionApiClient.getHousehold(token, householdId),
      ]);
      loaded.current = true;
      setTasks(tasksResult.tasks);
      setMaterializedThrough(tasksResult.materializedThrough ?? null);
      setMembers(householdResult.members);
    } catch (err) {
      setError(loaded.current ? '刷新失败，仍显示上次的任务。请检查网络后重试。' : '无法加载任务，请检查网络连接后重试。');
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  // Refetch whenever this screen regains focus (e.g. returning from
  // create/edit), not just on first mount — otherwise the list shows
  // stale data after a mutation elsewhere in the stack.
  useFocusEffect(
    useCallback(() => {
      void fetchData();
    }, [fetchData]),
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

  const completion = useTaskCompletion(householdId, fetchData);
  // Leaving the page (a detail window, another tab) closes the undo notice.
  const { dismissUndo } = completion;
  useFocusEffect(useCallback(() => dismissUndo, [dismissUndo]));

  const handleCreateTask = useCallback(() => {
    rememberRouteTrigger();
    void router.push(`/households/${encodeURIComponent(householdId!)}/tasks/new`);
  }, [router, householdId]);

  const todayIso = useMemo(() => toDateValue(new Date()), []);
  const generationWindow = classifyGenerationWindow({
    materializedThrough,
    todayIso,
    viewedDateIso: null,
    filtersActive: activeFilterCount > 0 || filter !== 'all',
  });
  const groups = useMemo(() => groupTasksByDue(filteredTasks, filter, todayIso), [filteredTasks, filter, todayIso]);

  const filterSummary = activeFilterCount ? [
    priorityFilter !== 'all' ? `${PRIORITY_FILTERS.find(p => p.key === priorityFilter)?.label}优先级` : '',
    assigneeFilter !== 'all' ? memberNameMap.get(assigneeFilter) ?? '已选负责人' : '',
    labelFilter !== 'all' ? availableLabels.find(l => l.id === labelFilter)?.name ?? '已选标签' : '',
    recurringFilter !== 'all' ? '仅重复' : '',
  ].filter(Boolean).join(' · ') : undefined;

  return (
    <HouseholdScreen
      active="tasks"
      accessibilityLabel="家庭任务"
      notice={completion.undoNotice}
      refreshing={refreshing}
      onRefresh={handleRefresh}
      width="reading"
      floatingAction={<FloatingCreateButton label="创建任务" onPress={handleCreateTask} />}
    >
      <Stack gap={5}>
        <PageIntro
          title="任务"
          {...(filterSummary ? { subtitle: filterSummary } : {})}
          action={<FilterButton ref={filterTrigger} label="筛选任务" count={activeFilterCount} onPress={() => setFiltersOpen(true)} />}
        />
        <FilterOptions hideLabel label="任务状态" options={FILTERS.map(f => ({ value: f.key, label: f.label, name: `筛选：${f.label}` }))} value={filter} onChange={value => setFilter(value as FilterKey)} />
        {filtersOpen ? <AppDialog title="筛选任务" trigger={filterTrigger} busy={false} onClose={() => setFiltersOpen(false)} footer={<FilterActions onClear={clearFilters} onDone={() => setFiltersOpen(false)} />}>
          <Stack gap={5}>
            <FilterOptions label="优先级" options={PRIORITY_FILTERS.map(p => ({ value: p.key, label: p.label, name: `优先级筛选：${p.label}` }))} value={priorityFilter} onChange={value => setPriorityFilter(value as PriorityFilterKey)} />
            <FilterOptions label="负责人" options={[{ value: 'all', label: '全部成员', name: '全部成员' }, ...assigneeOptions.map(m => ({ value: m.userId, label: m.displayName, name: `筛选：${m.displayName}` }))]} value={assigneeFilter} onChange={setAssigneeFilter} />
            {availableLabels.length ? <FilterOptions label="标签" options={[{ value: 'all', label: '全部标签', name: '全部标签' }, ...availableLabels.map(l => ({ value: l.id, label: l.name, name: `筛选标签：${l.name}` }))]} value={labelFilter} onChange={setLabelFilter} /> : null}
            <FilterOptions label={RECURRING_FILTER_GROUP_LABEL} options={RECURRING_FILTERS.map(f => ({ value: f.key, label: f.label, name: recurringFilterAccessibilityLabel(f.key) }))} value={recurringFilter} onChange={value => setRecurringFilter(value as RecurringFilterKey)} />
          </Stack>
        </AppDialog> : null}

        {loading && <LoadingState label="正在加载任务" />}

        {error !== null && <LoadError message={error} onRetry={() => void fetchData()} retryAccessibilityLabel="重试加载任务" />}

        {!loading && error === null && filteredTasks.length === 0 && (
          generationWindow === 'behind' ? (
            <StatusPanel
              action={null}
              body={GENERATION_BEHIND_BODY}
              heading={GENERATION_BEHIND_HEADING}
              kind="offline"
            />
          ) : (
            <EmptyState
              {...(tasks.length === 0 ? { title: '还没有任务' } : {})}
              message={tasks.length === 0
                ? '创建第一个任务，和家人一起安排。'
                : recurringFilter === 'recurring' &&
                    filter === 'all' &&
                    priorityFilter === 'all' &&
                    assigneeFilter === 'all' &&
                    labelFilter === 'all'
                  ? RECURRING_EMPTY_TASKS
                  : '没有符合筛选条件的任务。'}
              {...(activeFilterCount ? { action: <Button label="调整筛选" tone="secondary" onPress={() => setFiltersOpen(true)} /> } : {})}
            />
          )
        )}

        {groups.map(group => (
          <View key={group.key}>
            <GroupLabel tone={group.tone}>{group.label}</GroupLabel>
            <ListGroup>
              {group.tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  assignees={(task.assigneeIds ?? []).map((uid) => ({ id: uid, name: memberNameMap.get(uid) ?? '未知成员' }))}
                  onPress={handleTaskPress} onEdit={editTask(task)} onDelete={deleteTask(task)}
                  {...completion.cardProps(task)}
                />
              ))}
            </ListGroup>
          </View>
        ))}
      </Stack>
    </HouseholdScreen>
  );
}
