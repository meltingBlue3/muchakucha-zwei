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
} from '../../../../../src/ui/household-components';
import { Stack, Text } from '../../../../../src/ui/primitives';
import type { Theme } from '../../../../../src/ui/theme';

type FilterKey = 'all' | 'pending' | 'in_progress' | 'completed';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待办' },
  { key: 'in_progress', label: '进行中' },
  { key: 'completed', label: '已完成' },
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
  } = useHouseholdContext();

  const [tasks, setTasks] = useState<TaskResponseDto[]>([]);
  const [members, setMembers] = useState<GetHouseholdMemberDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');

  const householdId = id ?? currentHouseholdId;
  const currentHousehold = households.find((h) => h.id === currentHouseholdId) ?? null;

  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      map.set(m.userId, m.displayName);
    }
    return map;
  }, [members]);

  const filteredTasks = useMemo(() => {
    if (filter === 'all') return tasks;
    return tasks.filter((t) => t.status === filter);
  }, [tasks, filter]);

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

  const handleCreateTask = useCallback(() => {
    void router.push(`/households/${encodeURIComponent(householdId!)}/tasks/new`);
  }, [router, householdId]);

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
    <AppShell accessibilityLabel="家庭任务">
      <Stack gap={4}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <HouseholdHeader
            householdName={currentHousehold?.name ?? ''}
            onOpenSwitcher={() => {}}
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

        {/* Filters */}
        <View style={{ flexDirection: 'row', gap: activeTheme.spacing[2] }}>
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
          />
        ))}
      </Stack>
    </AppShell>
  );
}
