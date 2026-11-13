import { statusLabel, priorityLabel } from './task-utils';
import { useTranslation } from '../../i18n';
import { useContentChanges } from '../content/content-changes';
import { useResourceNavigation } from '../../ui/use-resource-navigation';
import { useDesktop } from '../../ui/use-desktop';
import { SearchField } from '../../ui/search-field';
import { theme } from '../../ui/theme';
import { useOpenWindowItem } from '../../ui/route-window';
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
  generationBehindBody,
  generationBehindHeading,
  recurringEmptyTasks,
  RECURRING_FILTERS,
  recurringFilterAccessibilityLabel,
  type RecurringFilterKey,
} from '../recurrence/recurring-filter';
import { TaskCard } from './task-card';
import { toDateValue } from '../../ui/date-values';
import { useMinuteClock } from '../../ui/use-minute-clock';
import { Button, EmptyState, LoadError, LoadingState, Stack, StatusPanel } from '../../ui/primitives';

type FilterKey = 'all' | 'pending' | 'in_progress' | 'completed';
type PriorityFilterKey = 'all' | 'low' | 'medium' | 'high' | 'urgent';

// Status is the everyday question, so it sits on the page; the rest waits in 筛选.
const FILTERS = ['pending', 'in_progress', 'completed', 'all'] as const;

const PRIORITY_FILTERS = ['all', 'low', 'medium', 'high', 'urgent'] as const;

type TaskGroup = { key: 'completed' | 'overdue' | 'today' | 'later' | 'undated' | 'closed'; tone: 'muted' | 'accent'; tasks: TaskResponseDto[] };

/**
 * Open work grouped by when it is due — 逾期, 今天, 之后, then 待安排 for tasks
 * without a date — so the list reads like a plan. Finished work is one group.
 */
export function groupTasksByDue(tasks: TaskResponseDto[], status: FilterKey, today: string): TaskGroup[] {
  if (status === 'completed') return [{ key: 'completed', tone: 'muted', tasks }];
  const overdue: TaskResponseDto[] = [];
  const dueToday: TaskResponseDto[] = [];
  const later: TaskResponseDto[] = [];
  const undated: TaskResponseDto[] = [];
  const closed: TaskResponseDto[] = [];
  for (const task of tasks) {
    const due = task.dueDate ?? null;
    if (task.status === 'completed' || task.status === 'cancelled') closed.push(task);
    else if (due === null || due === '') undated.push(task);
    else if (toDateValue(new Date(due)) < today) overdue.push(task);
    else if (toDateValue(new Date(due)) === today) dueToday.push(task);
    else later.push(task);
  }
  const byDue = (a: TaskResponseDto, b: TaskResponseDto) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime();
  const groups: TaskGroup[] = [
    { key: 'overdue', tone: 'accent' as const, tasks: overdue.sort(byDue) },
    { key: 'today', tone: 'muted' as const, tasks: dueToday.sort(byDue) },
    { key: 'later', tone: 'muted' as const, tasks: later.sort(byDue) },
    { key: 'undated', tone: 'muted' as const, tasks: undated },
    { key: 'closed', tone: 'muted' as const, tasks: closed },
  ];
  return groups.filter(group => group.tasks.length > 0);
}

export default function TaskListScreen() {
  const { t } = useTranslation(['tasks', 'shared', 'auth', 'navigation', 'editConflict', 'recurrence']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const desktop = useDesktop();
  const [query, setQuery] = useState('');
  const openResource = useResourceNavigation();
  const openTaskId = useOpenWindowItem('taskId');
  const deleteTask = useContentDelete('tasks');
  const editTask = useContentEdit('tasks');
  const { currentHouseholdId } = useHouseholdContext();

  const [tasks, setTasks] = useState<TaskResponseDto[]>([]);
  const [materializedThrough, setMaterializedThrough] = useState<string | null>(null);
  const [members, setMembers] = useState<GetHouseholdMemberDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'auth:errors.sessionExpired' | 'refreshError' | 'loadError' | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useWorkspaceState<FilterKey>(`view:${id}:tasks:filter`, 'pending');
  const [priorityFilter, setPriorityFilter] = useWorkspaceState<PriorityFilterKey>(`view:${id}:tasks:priorityFilter`, 'all');
  const [assigneeFilter, setAssigneeFilter] = useWorkspaceState<string>(`view:${id}:tasks:assigneeFilter`, 'all');
  const [labelFilter, setLabelFilter] = useWorkspaceState<string>(`view:${id}:tasks:labelFilter`, 'all');
  const [recurringFilter, setRecurringFilter] = useWorkspaceState<RecurringFilterKey>(`view:${id}:tasks:recurringFilter`, 'all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterTrigger = useRef<View>(null);
  const loadedHousehold = useRef<string | null>(null);
  const requestGeneration = useRef(0);
  const todayIso = toDateValue(useMinuteClock().date);

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
    let result = tasks.filter(task => task.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
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
  }, [tasks, query, filter, priorityFilter, assigneeFilter, labelFilter, recurringFilter]);

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
    const request = ++requestGeneration.current;
    if (loadedHousehold.current !== householdId) {
      setLoading(true); setTasks([]); setMembers([]); setMaterializedThrough(null);
    }
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (request !== requestGeneration.current) return;
      if (token === null) {
        setError('auth:errors.sessionExpired');
        return;
      }
      const [tasksResult, householdResult] = await Promise.all([
        sessionApiClient.listTasks(token, householdId),
        sessionApiClient.getHousehold(token, householdId),
      ]);
      if (request !== requestGeneration.current) return;
      loadedHousehold.current = householdId;
      setTasks(tasksResult.tasks);
      setMaterializedThrough(tasksResult.materializedThrough ?? null);
      setMembers(householdResult.members);
    } catch {
      if (request === requestGeneration.current) setError(loadedHousehold.current === householdId ? 'refreshError' : 'loadError');
    } finally {
      if (request === requestGeneration.current) setLoading(false);
    }
  }, [householdId]);

  useContentChanges(householdId, fetchData);

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
      return () => { requestGeneration.current++; };
    }, [fetchData]),
  );

  const handleTaskPress = useCallback(
    (task: TaskResponseDto) => {
      rememberRouteTrigger();
      openResource(
        `/households/${encodeURIComponent(householdId!)}/tasks/${encodeURIComponent(task.id)}`,
      );
    },
    [router, householdId, openResource],
  );

  const completion = useTaskCompletion(householdId, fetchData);
  // Leaving the page (a detail window, another tab) closes the undo notice.
  const { dismissUndo } = completion;
  useFocusEffect(useCallback(() => dismissUndo, [dismissUndo]));

  const handleCreateTask = useCallback(() => {
    rememberRouteTrigger();
    openResource(`/households/${encodeURIComponent(householdId!)}/tasks/new`);
  }, [router, householdId, openResource]);

  const generationWindow = classifyGenerationWindow({
    materializedThrough,
    todayIso,
    viewedDateIso: null,
    filtersActive: activeFilterCount > 0 || filter !== 'all',
  });
  const groups = useMemo(() => groupTasksByDue(filteredTasks, filter, todayIso), [filteredTasks, filter, todayIso]);

  const filterSummary = activeFilterCount ? [
    priorityFilter !== 'all' ? t('prioritySummary', { label: priorityLabel(priorityFilter) }) : '',
    assigneeFilter !== 'all' ? memberNameMap.get(assigneeFilter) ?? t('selectedAssignee') : '',
    labelFilter !== 'all' ? availableLabels.find(l => l.id === labelFilter)?.name ?? t('selectedLabel') : '',
    recurringFilter !== 'all' ? t('recurringOnly') : '',
  ].filter(Boolean).join(' · ') : undefined;
  const statusControl = <FilterOptions hideLabel label={t('statusField')} options={FILTERS.map(value => {
    const label = value === 'all' ? t('all') : statusLabel(value);
    return { value, label, name: t('filterOption', { label }) };
  })} value={filter} onChange={value => setFilter(value as FilterKey)} />;

  return (
    <HouseholdScreen
      active="tasks"
      accessibilityLabel={t('main')}
      notice={completion.undoNotice}
      refreshing={refreshing}
      onRefresh={handleRefresh}
      width="reading"
      floatingAction={<FloatingCreateButton label={t('create')} onPress={handleCreateTask} />}
    >
      <Stack gap={desktop ? 3 : 5} style={desktop ? { maxWidth: theme.layout.listPaneMaxWidth } : undefined}>
        <PageIntro
          title={t('navigation:pages.tasks')}
          {...(filterSummary ? { subtitle: filterSummary } : desktop && !loading ? { subtitle: t('openCount', { count: tasks.filter(task => task.status !== 'completed' && task.status !== 'cancelled').length }) } : {})}
          {...(desktop ? { controls: statusControl } : {})}
          action={<>{desktop ? <><SearchField label={t('search')} placeholder={t('search')} value={query} onChangeText={setQuery} /></> : null}<FilterButton ref={filterTrigger} label={t('filter')} count={activeFilterCount} onPress={() => setFiltersOpen(true)} /></>}
        />
        {!desktop ? statusControl : null}
        {filtersOpen ? <AppDialog title={t('filter')} trigger={filterTrigger} busy={false} onClose={() => setFiltersOpen(false)} footer={<FilterActions onClear={clearFilters} onDone={() => setFiltersOpen(false)} />}>
          <Stack gap={5}>
            <FilterOptions label={t('editConflict:priority')} options={PRIORITY_FILTERS.map(value => {
              const label = value === 'all' ? t('allPriorities') : priorityLabel(value);
              return { value, label, name: t('priorityOption', { label }) };
            })} value={priorityFilter} onChange={value => setPriorityFilter(value as PriorityFilterKey)} />
            <FilterOptions label={t('shared:assignee')} options={[{ value: 'all', label: t('allMembers'), name: t('allMembers') }, ...assigneeOptions.map(m => ({ value: m.userId, label: m.displayName, name: t('filterOption', { label: m.displayName }) }))]} value={assigneeFilter} onChange={setAssigneeFilter} />
            {availableLabels.length ? <FilterOptions label={t('editConflict:labels')} options={[{ value: 'all', label: t('allLabels'), name: t('allLabels') }, ...availableLabels.map(l => ({ value: l.id, label: l.name, name: t('labelOption', { label: l.name }) }))]} value={labelFilter} onChange={setLabelFilter} /> : null}
            <FilterOptions label={t('recurrence:repeat')} options={RECURRING_FILTERS.map(value => ({ value, label: t(`recurrence:filter.${value}`), name: recurringFilterAccessibilityLabel(value) }))} value={recurringFilter} onChange={value => setRecurringFilter(value as RecurringFilterKey)} />
          </Stack>
        </AppDialog> : null}

        {loading && <LoadingState label={t('loading')} />}

        {error !== null && <LoadError message={t(error)} onRetry={() => void fetchData()} retryAccessibilityLabel={t('retryLoad')} />}

        {!loading && error === null && filteredTasks.length === 0 && (
          generationWindow === 'behind' ? (
            <StatusPanel
              action={null}
              body={generationBehindBody()}
              heading={generationBehindHeading()}
              kind="offline"
            />
          ) : (
            <EmptyState
              {...(tasks.length === 0 ? { title: t('emptyTitle') } : {})}
              message={tasks.length === 0
                ? t('emptyMessage')
                : recurringFilter === 'recurring' &&
                    filter === 'all' &&
                    priorityFilter === 'all' &&
                    assigneeFilter === 'all' &&
                    labelFilter === 'all'
                  ? recurringEmptyTasks()
                  : t('emptyFiltered')}
              {...(activeFilterCount ? { action: <Button label={t('adjustFilter')} tone="secondary" onPress={() => setFiltersOpen(true)} /> } : {})}
            />
          )
        )}

        {groups.map(group => (
          <View key={group.key}>
            <GroupLabel flush tone={group.tone}>{t(`groups.${group.key}`, { count: group.tasks.length })}</GroupLabel>
            <ListGroup flush>
              {group.tasks.map((task) => (
                <TaskCard
                  table
                  key={task.id}
                  task={task}
                  assignees={(task.assigneeIds ?? []).map((uid) => ({ id: uid, name: memberNameMap.get(uid) ?? t('unknownMember') }))}
                  onPress={handleTaskPress} onEdit={editTask(task)} onDelete={deleteTask(task)}
                  selected={task.id === openTaskId}
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
