import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { TaskResponseDto, GetHouseholdMemberDto } from '@muchakucha/api-client';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import ListFilter from 'lucide-react-native/icons/list-filter';

import { sessionApiClient, sessionTransport } from '../../../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../../../src/features/households/household-context';
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
} from '../../../../../src/features/recurrence/recurring-filter';
import { TaskCard } from '../../../../../src/features/tasks/task-card';
import {
  AccessChangedPanel,
  AppShell,
  HouseholdHeader,
  HouseholdSwitcher,
} from '../../../../../src/ui/household-components';
import { Stack, StatusPanel, Text } from '../../../../../src/ui/primitives';
import type { Theme } from '../../../../../src/ui/theme';

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

export default function TaskListRoute() {
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

  const [tasks, setTasks] = useState<TaskResponseDto[]>([]);
  const [materializedThrough, setMaterializedThrough] = useState<string | null>(null);
  const [members, setMembers] = useState<GetHouseholdMemberDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilterKey>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [labelFilter, setLabelFilter] = useState<string>('all');
  const [recurringFilter, setRecurringFilter] = useState<RecurringFilterKey>('all');
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [statusChangingTaskId, setStatusChangingTaskId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const householdId = id ?? currentHouseholdId;
  const currentHousehold = households.find((h) => h.id === currentHouseholdId) ?? null;

  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      map.set(m.userId, m.displayName);
    }
    return map;
  }, [members]);

  // Extract unique labels from loaded tasks
  const availableLabels = useMemo(() => {
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
    setLoading(true);
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
      setTasks(tasksResult.tasks);
      setMaterializedThrough(tasksResult.materializedThrough ?? null);
      setMembers(householdResult.members);
    } catch (err) {
      setError('无法加载任务，请检查网络连接后重试。');
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
      void router.push(
        `/households/${encodeURIComponent(householdId!)}/tasks/${encodeURIComponent(task.id)}`,
      );
    },
    [router, householdId],
  );

  const handleTaskStatusChange = useCallback(async (task: TaskResponseDto) => {
    if (householdId === undefined || householdId === '') return;
    const nextStatus =
      task.status === 'pending' ? 'in_progress'
        : task.status === 'in_progress' ? 'completed'
        : 'pending';
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
      // silently ignore
    } finally {
      setStatusChangingTaskId(null);
    }
  }, [householdId, fetchData]);

  const handleCreateTask = useCallback(() => {
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
    if (householdId === currentHouseholdId) {
      setSwitcherOpen(false);
      return;
    }
    const success = await switchHousehold(householdId);
    if (success) {
      void router.replace(`/households/${encodeURIComponent(householdId)}/tasks`);
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
    <AppShell accessibilityLabel="家庭任务" refreshing={refreshing} onRefresh={handleRefresh} title="家庭任务" showProfile>
      <Stack gap={4}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <HouseholdHeader
            householdName={currentHousehold?.name ?? ''}
            onOpenSwitcher={() => setSwitcherOpen(true)}
          />
          <Pressable
            onPress={handleCreateTask}
            accessibilityLabel="创建任务"
            hitSlop={activeTheme.spacing[2]}
            style={({ pressed }) => ({
              backgroundColor: activeTheme.colors.coral,
              paddingHorizontal: activeTheme.spacing[4],
              paddingVertical: activeTheme.spacing[2],
              borderRadius: activeTheme.borderRadii.full,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text variant="button" color="surface">
              + 新建
            </Text>
          </Pressable>
        </View>

        {/* Filters (collapsible — keeps the four filter groups from dominating the page) */}
        <View>
          <Pressable
            onPress={() => setFiltersOpen((open) => !open)}
            hitSlop={activeTheme.spacing[2]}
            accessibilityRole="button"
            accessibilityState={{ expanded: filtersOpen }}
            accessibilityLabel={`筛选任务${activeFilterCount > 0 ? `，已选择 ${activeFilterCount} 项` : ''}`}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: activeTheme.spacing[2],
              minHeight: activeTheme.controlSizes.touchTarget,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <ListFilter
              size={activeTheme.controlSizes.icon}
              color={activeTheme.colors.ink}
              strokeWidth={activeTheme.controlSizes.iconStroke}
            />
            <Text variant="label">筛选</Text>
            {activeFilterCount > 0 && (
              <View style={{
                minWidth: 18,
                height: 18,
                paddingHorizontal: activeTheme.spacing[1],
                borderRadius: activeTheme.borderRadii.full,
                backgroundColor: activeTheme.colors.coral,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Text variant="caption" color="surface">{activeFilterCount}</Text>
              </View>
            )}
            <View style={{ flex: 1 }} />
            {filtersOpen ? (
              <ChevronUp size={activeTheme.controlSizes.icon} color={activeTheme.colors.inkMuted} strokeWidth={activeTheme.controlSizes.iconStroke} />
            ) : (
              <ChevronDown size={activeTheme.controlSizes.icon} color={activeTheme.colors.inkMuted} strokeWidth={activeTheme.controlSizes.iconStroke} />
            )}
          </Pressable>

          {filtersOpen && (
            <Stack gap={3} style={{ paddingTop: activeTheme.spacing[1] }}>
              {/* Status filters */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: activeTheme.spacing[2] }}>
                {FILTERS.map((f) => (
                  <Pressable
                    key={f.key}
                    onPress={() => setFilter(f.key)}
                    hitSlop={activeTheme.spacing[2]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: filter === f.key }}
                    style={({ pressed }) => ({
                      paddingHorizontal: activeTheme.spacing[3],
                      paddingVertical: activeTheme.spacing[2],
                      borderRadius: activeTheme.borderRadii.full,
                      backgroundColor: filter === f.key ? activeTheme.colors.coral : activeTheme.colors.surfaceMuted,
                      opacity: pressed ? 0.7 : 1,
                    })}
                    accessibilityLabel={`筛选：${f.label}`}
                  >
                    <Text variant="bodySm" color={filter === f.key ? 'surface' : 'inkMuted'}>
                      {f.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Priority filters */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: activeTheme.spacing[2] }}>
                {PRIORITY_FILTERS.map((p) => (
                  <Pressable
                    key={p.key}
                    onPress={() => setPriorityFilter(p.key)}
                    hitSlop={activeTheme.spacing[3]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: priorityFilter === p.key }}
                    style={({ pressed }) => ({
                      paddingHorizontal: activeTheme.spacing[3],
                      paddingVertical: activeTheme.spacing[1],
                      borderRadius: activeTheme.borderRadii.full,
                      borderWidth: 1,
                      borderColor: priorityFilter === p.key ? activeTheme.colors.coral : activeTheme.colors.border,
                      backgroundColor: 'transparent',
                      opacity: pressed ? 0.7 : 1,
                    })}
                    accessibilityLabel={`优先级筛选：${p.label}`}
                  >
                    <Text variant="caption" color={priorityFilter === p.key ? 'coral' : 'inkMuted'}>
                      {p.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Assignee filter — horizontally scrollable so a household with
                  many members doesn't grow the panel's height unboundedly */}
              {assigneeOptions.length > 1 && (
                <Stack gap={1}>
                  <Text variant="caption" color="inkMuted">负责人</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ flexDirection: 'row', gap: activeTheme.spacing[2], paddingRight: activeTheme.spacing[4] }}
                  >
                    <Pressable
                      onPress={() => setAssigneeFilter('all')}
                      hitSlop={activeTheme.spacing[3]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: assigneeFilter === 'all' }}
                      style={({ pressed }) => ({
                        paddingHorizontal: activeTheme.spacing[3],
                        paddingVertical: activeTheme.spacing[1],
                        borderRadius: activeTheme.borderRadii.full,
                        borderWidth: 1,
                        borderColor: assigneeFilter === 'all' ? activeTheme.colors.teal : activeTheme.colors.border,
                        backgroundColor: 'transparent',
                        opacity: pressed ? 0.7 : 1,
                      })}
                      accessibilityLabel="全部成员"
                    >
                      <Text variant="caption" color={assigneeFilter === 'all' ? 'teal' : 'inkMuted'}>
                        全部成员
                      </Text>
                    </Pressable>
                    {assigneeOptions.map((m) => (
                      <Pressable
                        key={m.userId}
                        onPress={() => setAssigneeFilter(m.userId)}
                        hitSlop={activeTheme.spacing[3]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: assigneeFilter === m.userId }}
                        style={({ pressed }) => ({
                          paddingHorizontal: activeTheme.spacing[3],
                          paddingVertical: activeTheme.spacing[1],
                          borderRadius: activeTheme.borderRadii.full,
                          borderWidth: 1,
                          borderColor: assigneeFilter === m.userId ? activeTheme.colors.teal : activeTheme.colors.border,
                          backgroundColor: 'transparent',
                          opacity: pressed ? 0.7 : 1,
                        })}
                        accessibilityLabel={`筛选：${m.displayName}`}
                      >
                        <Text variant="caption" color={assigneeFilter === m.userId ? 'teal' : 'inkMuted'}>
                          {m.displayName}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </Stack>
              )}

              {/* Label filter — same horizontal-scroll treatment; a household
                  can accumulate far more labels than fit in one wrapped row */}
              {availableLabels.length > 0 && (
                <Stack gap={1}>
                  <Text variant="caption" color="inkMuted">标签</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: activeTheme.spacing[2], paddingRight: activeTheme.spacing[4] }}
                  >
                    <Pressable
                      onPress={() => setLabelFilter('all')}
                      hitSlop={activeTheme.spacing[3]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: labelFilter === 'all' }}
                      style={({ pressed }) => ({
                        paddingHorizontal: activeTheme.spacing[3],
                        paddingVertical: activeTheme.spacing[1],
                        borderRadius: activeTheme.borderRadii.full,
                        borderWidth: 1,
                        borderColor: labelFilter === 'all' ? activeTheme.colors.coral : activeTheme.colors.border,
                        backgroundColor: 'transparent',
                        opacity: pressed ? 0.7 : 1,
                      })}
                      accessibilityLabel="全部标签"
                    >
                      <Text variant="caption" color={labelFilter === 'all' ? 'coral' : 'inkMuted'}>
                        全部标签
                      </Text>
                    </Pressable>
                    {availableLabels.map((l) => (
                      <Pressable
                        key={l.id}
                        onPress={() => setLabelFilter(labelFilter === l.id ? 'all' : l.id)}
                        hitSlop={activeTheme.spacing[3]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: labelFilter === l.id }}
                        style={({ pressed }) => ({
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: activeTheme.spacing[1],
                          paddingHorizontal: activeTheme.spacing[3],
                          paddingVertical: activeTheme.spacing[1],
                          borderRadius: activeTheme.borderRadii.full,
                          borderWidth: 1,
                          borderColor: labelFilter === l.id ? l.color : activeTheme.colors.border,
                          backgroundColor: labelFilter === l.id ? l.color + '18' : 'transparent',
                          opacity: pressed ? 0.7 : 1,
                        })}
                        accessibilityLabel={`筛选标签：${l.name}`}
                      >
                        <View style={{ width: 8, height: 8, borderRadius: activeTheme.borderRadii.full, backgroundColor: l.color }} />
                        <Text variant="caption" style={{ color: labelFilter === l.id ? l.color : activeTheme.colors.inkMuted }}>
                          {l.name}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </Stack>
              )}

              {/* Recurring filter — client-side only (judged by isRecurringInstance),
                  a radiogroup rather than a checkbox, so screen readers don't
                  read "all" and "recurring only" as independently selectable */}
              <Stack gap={1}>
                <Text variant="caption" color="inkMuted">{RECURRING_FILTER_GROUP_LABEL}</Text>
                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel="重复筛选"
                  style={{ flexDirection: 'row', flexWrap: 'wrap', gap: activeTheme.spacing[2] }}
                >
                  {RECURRING_FILTERS.map((f) => (
                    <Pressable
                      key={f.key}
                      onPress={() => setRecurringFilter(f.key)}
                      hitSlop={activeTheme.spacing[3]}
                      accessibilityRole="radio"
                      // role="radio" requires aria-checked (WCAG 4.1.2).
                      // accessibilityState alone does not emit it on Web, so mirror
                      // RecurrencePicker: `checked` for native, an explicit
                      // aria-checked for the Web DOM.
                      accessibilityState={{ checked: recurringFilter === f.key }}
                      aria-checked={recurringFilter === f.key}
                      style={({ pressed }) => ({
                        paddingHorizontal: activeTheme.spacing[3],
                        paddingVertical: activeTheme.spacing[1],
                        borderRadius: activeTheme.borderRadii.full,
                        borderWidth: 1,
                        borderColor: recurringFilter === f.key ? activeTheme.colors.coral : activeTheme.colors.border,
                        backgroundColor: 'transparent',
                        opacity: pressed ? 0.7 : 1,
                      })}
                      accessibilityLabel={recurringFilterAccessibilityLabel(f.key)}
                    >
                      <Text variant="caption" color={recurringFilter === f.key ? 'coral' : 'inkMuted'}>
                        {f.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </Stack>
            </Stack>
          )}
        </View>

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
              accessibilityLabel="重试加载任务"
              style={{ marginTop: activeTheme.spacing[2], alignSelf: 'flex-start' }}
            >
              <Text variant="label" color="coral">重试</Text>
            </Pressable>
          </View>
        )}

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
            <Text variant="bodySm" color="inkMuted">
              {activeFilterCount === 0
                ? '还没有任务。点击上方按钮创建第一个任务。'
                : recurringFilter === 'recurring' &&
                    filter === 'all' &&
                    priorityFilter === 'all' &&
                    assigneeFilter === 'all' &&
                    labelFilter === 'all'
                  ? RECURRING_EMPTY_TASKS
                  : '没有符合筛选条件的任务。'}
            </Text>
          )
        )}

        {filteredTasks.map((task) => (
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
