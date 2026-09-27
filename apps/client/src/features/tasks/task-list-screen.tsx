import { FloatingCreateButton } from '../../ui/floating-create-button';
import { useContentDelete, useContentEdit } from '../content/use-content-delete';
import { FilterOptions } from '../../ui/filter-options';
import { AppDialog } from '../../ui/app-dialog';
import { rememberRouteTrigger } from '../../platform/overlays/route-trigger';
import { PageIntro } from '../../ui/page-intro';
import { useWorkspaceState } from '../../ui/workspace-state';
import { HouseholdNavigation } from '../../ui/household-navigation';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { TaskResponseDto, GetHouseholdMemberDto } from '@muchakucha/api-client';
import ListFilter from 'lucide-react-native/icons/list-filter';

import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { useTaskCompletion } from './use-task-completion';
import { useHouseholdContext } from '../households/household-context';
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
import {
  AccessChangedPanel,
  AppShell,
  HouseholdHeader,
  HouseholdSwitcher,
} from '../../ui/household-components';
import { Button, EmptyState, LoadError, LoadingState, Stack, StatusPanel, Text } from '../../ui/primitives';
import type { Theme } from '../../ui/theme';

type FilterKey = 'all' | 'pending' | 'in_progress' | 'completed';
type PriorityFilterKey = 'all' | 'low' | 'medium' | 'high' | 'urgent';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待办' },
  { key: 'in_progress', label: '进行中' },
  { key: 'completed', label: '已完成' },
];

const PRIORITY_FILTERS: { key: PriorityFilterKey; label: string }[] = [
  { key: 'all', label: '全部优先级' },
  { key: 'low', label: '低' },
  { key: 'medium', label: '中' },
  { key: 'high', label: '高' },
  { key: 'urgent', label: '紧急' },
];

export default function TaskListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const deleteTask = useContentDelete('tasks');
  const editTask = useContentEdit('tasks');
  const activeTheme = useTheme<Theme>();
  const {
    viewState,
    households,
    currentHouseholdId,
    accessChangedHouseholdName,
    refreshHouseholds,
    switchHousehold,
  } = useHouseholdContext();

  const [tasks, setTasks] = useState<TaskResponseDto[]>([]);
  const [materializedThrough, setMaterializedThrough] = useState<string | null>(null);
  const [members, setMembers] = useState<GetHouseholdMemberDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useWorkspaceState<FilterKey>(`view:${id}:tasks:filter`, 'all');
  const [priorityFilter, setPriorityFilter] = useWorkspaceState<PriorityFilterKey>(`view:${id}:tasks:priorityFilter`, 'all');
  const [assigneeFilter, setAssigneeFilter] = useWorkspaceState<string>(`view:${id}:tasks:assigneeFilter`, 'all');
  const [labelFilter, setLabelFilter] = useWorkspaceState<string>(`view:${id}:tasks:labelFilter`, 'all');
  const [recurringFilter, setRecurringFilter] = useWorkspaceState<RecurringFilterKey>(`view:${id}:tasks:recurringFilter`, 'all');
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterTrigger = useRef<View>(null);
  const loaded = useRef(false);

  const householdId = id ?? currentHouseholdId;
  const currentHousehold = households.find((h) => h.id === (id ?? currentHouseholdId)) ?? null;

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

  const activeFilterCount = [
    filter !== 'all',
    priorityFilter !== 'all',
    assigneeFilter !== 'all',
    labelFilter !== 'all',
    recurringFilter !== 'all',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setFilter('all'); setPriorityFilter('all'); setAssigneeFilter('all'); setLabelFilter('all'); setRecurringFilter('all');
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
    if (householdId === undefined || householdId === '') return;
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

  const handleCreateTask = useCallback(() => {
    rememberRouteTrigger();
    void router.push(`/households/${encodeURIComponent(householdId!)}/tasks/new`);
  }, [router, householdId]);

  const todayIso = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);
  const generationWindow = classifyGenerationWindow({
    materializedThrough,
    todayIso,
    viewedDateIso: null,
    filtersActive: activeFilterCount > 0,
  });

  const handleSwitch = useCallback(async (householdId: string) => {
    if (householdId === (id ?? currentHouseholdId)) {
      setSwitcherOpen(false);
      return;
    }
    const success = await switchHousehold(householdId);
    if (success) {
      void router.replace(`/households/${encodeURIComponent(householdId)}/tasks`);
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
          onChooseOther={() => {
            void refreshHouseholds().then(() => router.replace('/households'));
          }}
          onCreateNew={() => {
            void router.replace('/household-handoff');
          }}
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
    <AppShell accessibilityLabel="家庭任务" refreshing={refreshing} onRefresh={handleRefresh} title="家庭任务" showProfile headerContent={<HouseholdHeader householdName={currentHousehold?.name ?? ''} onOpenSwitcher={() => setSwitcherOpen(true)} />} footer={<HouseholdNavigation householdId={householdId} active="tasks" />} floatingAction={viewState === 'ready' ? <FloatingCreateButton label="创建任务" onPress={handleCreateTask} /> : null}>
      <Stack gap={4}>

        {/* Header */}

          <PageIntro title="任务" />

        <FilterOptions label="任务状态" hideLabel options={FILTERS.map(f => ({ value: f.key, label: f.label, name: `筛选：${f.label}` }))} value={filter} onChange={value => setFilter(value as FilterKey)} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: activeTheme.spacing[2] }}>
          <Pressable ref={filterTrigger} accessibilityRole="button" accessibilityLabel={`筛选任务${activeFilterCount ? `，已选择 ${activeFilterCount} 项` : ''}`} onPress={() => setFiltersOpen(true)} style={{ minHeight: activeTheme.controlSizes.touchTarget, flexDirection: 'row', alignItems: 'center', gap: activeTheme.spacing[2] }}>
            <ListFilter size={activeTheme.controlSizes.icon} color={activeTheme.colors.ink} />
            <Text variant="label">筛选{activeFilterCount ? `（${activeFilterCount}）` : ''}</Text>
          </Pressable>
          <Text variant="bodySm" color="inkMuted" style={{ flex: 1 }}>{[
            priorityFilter !== 'all' ? `${PRIORITY_FILTERS.find(p => p.key === priorityFilter)?.label}优先级` : '',
            assigneeFilter !== 'all' ? memberNameMap.get(assigneeFilter) ?? '已选负责人' : '',
            labelFilter !== 'all' ? availableLabels.find(l => l.id === labelFilter)?.name ?? '已选标签' : '',
            recurringFilter !== 'all' ? '仅重复' : '',
          ].filter(Boolean).join(' · ')}</Text>
          {activeFilterCount ? <Pressable accessibilityRole="button" accessibilityLabel="清除任务筛选" onPress={clearFilters} style={{ minHeight: activeTheme.controlSizes.touchTarget, justifyContent: 'center' }}><Text variant="label" color="link">清除</Text></Pressable> : null}
        </View>
        {filtersOpen ? <AppDialog title="筛选任务" trigger={filterTrigger} busy={false} onClose={() => setFiltersOpen(false)} footer={<Button label="完成" onPress={() => setFiltersOpen(false)} />}>
          <Stack gap={4}>
            <FilterOptions label="优先级" options={PRIORITY_FILTERS.map(p => ({ value: p.key, label: p.label, name: `优先级筛选：${p.label}` }))} value={priorityFilter} onChange={value => setPriorityFilter(value as PriorityFilterKey)} />
            <FilterOptions label="负责人" options={[{ value: 'all', label: '全部成员', name: '全部成员' }, ...assigneeOptions.map(m => ({ value: m.userId, label: m.displayName, name: `筛选：${m.displayName}` }))]} value={assigneeFilter} onChange={setAssigneeFilter} />
            {availableLabels.length ? <FilterOptions label="标签" options={[{ value: 'all', label: '全部标签', name: '全部标签' }, ...availableLabels.map(l => ({ value: l.id, label: l.name, name: `筛选标签：${l.name}` }))]} value={labelFilter} onChange={setLabelFilter} /> : null}
            <FilterOptions label={RECURRING_FILTER_GROUP_LABEL} options={RECURRING_FILTERS.map(f => ({ value: f.key, label: f.label, name: recurringFilterAccessibilityLabel(f.key) }))} value={recurringFilter} onChange={value => setRecurringFilter(value as RecurringFilterKey)} />
          </Stack>
        </AppDialog> : null}

        {/* Loading */}
        {loading && <LoadingState label="正在加载任务" />}

        {/* Error */}
        {error !== null && <LoadError message={error} onRetry={() => void fetchData()} retryAccessibilityLabel="重试加载任务" />}

        {/* Task list */}
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
              message={activeFilterCount === 0
                ? '还没有任务。点击右下角“＋”创建第一个任务。'
                : recurringFilter === 'recurring' &&
                    filter === 'all' &&
                    priorityFilter === 'all' &&
                    assigneeFilter === 'all' &&
                    labelFilter === 'all'
                  ? RECURRING_EMPTY_TASKS
                  : '没有符合筛选条件的任务。'}
              {...(activeFilterCount ? { action: <Button label="清除筛选" tone="secondary" onPress={clearFilters} /> } : {})}
            />
          )
        )}

        {filteredTasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            assigneeNames={(task.assigneeIds ?? []).map((uid) => memberNameMap.get(uid) ?? '未知成员')}
            onPress={handleTaskPress} onEdit={editTask(task)} onDelete={deleteTask(task)}
            {...completion.cardProps(task)}
          />
        ))}
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
