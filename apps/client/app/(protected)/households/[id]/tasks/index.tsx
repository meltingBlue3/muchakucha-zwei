import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { TaskResponseDto, GetHouseholdMemberDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../../../src/features/households/household-context';
import { TaskCard } from '../../../../../src/features/tasks/task-card';
import {
  AccessChangedPanel,
  AppShell,
  HouseholdHeader,
  HouseholdSwitcher,
} from '../../../../../src/ui/household-components';
import { Stack, Text } from '../../../../../src/ui/primitives';
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
  const [members, setMembers] = useState<GetHouseholdMemberDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilterKey>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [labelFilter, setLabelFilter] = useState<string>('all');
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
      result = result.filter((t) => t.assigneeId === assigneeFilter);
    }
    if (labelFilter !== 'all') {
      result = result.filter((t) => (t.labels ?? []).some((l) => l.id === labelFilter));
    }
    return result;
  }, [tasks, filter, priorityFilter, assigneeFilter, labelFilter]);

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

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleTaskPress = useCallback(
    (task: TaskResponseDto) => {
      void router.push(
        `/households/${encodeURIComponent(householdId!)}/tasks/${encodeURIComponent(task.id)}/edit`,
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

        {/* Status filters */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: activeTheme.spacing[2] }}>
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
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

        {/* Assignee filter */}
        {assigneeOptions.length > 1 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: activeTheme.spacing[2] }}>
            <Pressable
              onPress={() => setAssigneeFilter('all')}
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
          </View>
        )}

        {/* Label filter */}
        {availableLabels.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: activeTheme.spacing[2], alignItems: 'center' }}>
            <Pressable
              onPress={() => setLabelFilter('all')}
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
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: l.color }} />
                <Text variant="caption" style={{ color: labelFilter === l.id ? l.color : activeTheme.colors.inkMuted }}>
                  {l.name}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

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
            <Pressable onPress={() => void fetchData()} style={{ marginTop: activeTheme.spacing[2] }}>
              <Text variant="label" color="coral">重试</Text>
            </Pressable>
          </View>
        )}

        {/* Task list */}
        {!loading && error === null && filteredTasks.length === 0 && (
          <Text variant="bodySm" color="inkMuted">
            {filter === 'all' ? '还没有任务。点击上方按钮创建第一个任务。' : '没有符合筛选条件的任务。'}
          </Text>
        )}

        {filteredTasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            assigneeName={task.assigneeId ? (memberNameMap.get(task.assigneeId) ?? '') : ''}
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
