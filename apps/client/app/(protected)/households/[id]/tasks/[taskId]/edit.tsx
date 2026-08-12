import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import { ApiClientError } from '@muchakucha/api-client';
import type {
  TaskResponseDto,
  GetHouseholdMemberDto,
  RecurrenceDto,
  UpdateSeriesDto,
} from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../../../../src/features/households/household-context';
import { TaskForm } from '../../../../../../src/features/tasks/task-form';
import { recurrenceInputFromResponse } from '../../../../../../src/features/recurrence/recurrence-picker';
import {
  SeriesScopeSheet,
  type SeriesScope,
  type SeriesScopeMode,
} from '../../../../../../src/features/recurrence/series-scope-sheet';
import {
  AccessChangedPanel,
  AppShell,
  HouseholdHeader,
} from '../../../../../../src/ui/household-components';
import { Stack, Text } from '../../../../../../src/ui/primitives';
import type { Theme } from '../../../../../../src/ui/theme';
import type { CreateTaskDto } from '@muchakucha/api-client';

type PendingSeriesAction =
  | { kind: 'save'; data: CreateTaskDto; mode: SeriesScopeMode }
  | { kind: 'delete'; mode: 'delete' };

function recurrenceChanged(
  current: TaskResponseDto['recurrence'],
  next: RecurrenceDto | undefined,
): boolean {
  const normalizedCurrent = recurrenceInputFromResponse(current);
  const normalizedNext = next ?? null;
  return JSON.stringify(normalizedCurrent) !== JSON.stringify(normalizedNext);
}

const SERIES_FAILURE = '没有完成。这个重复安排没有发生任何改变，请重试。';
const SERIES_MISSING = '这一次重复已经被其他人删除了。返回后可以看到最新的安排。';

function taskSeriesUpdate(data: CreateTaskDto): UpdateSeriesDto {
  const status = data.status;
  const priority = data.priority;
  return {
    title: data.title,
    ...(data.description === undefined ? {} : { description: data.description }),
    ...(status === 'pending' || status === 'in_progress' || status === 'completed' || status === 'cancelled'
      ? { status }
      : {}),
    ...(priority === 'low' || priority === 'medium' || priority === 'high' || priority === 'urgent'
      ? { priority }
      : {}),
    ...(data.assigneeIds === undefined ? {} : { assigneeIds: data.assigneeIds }),
    ...(data.dueDate === undefined ? {} : { dueDate: data.dueDate }),
    ...(data.recurrence === undefined ? {} : { recurrence: data.recurrence }),
  };
}

export default function EditTaskRoute() {
  const { id, taskId } = useLocalSearchParams<{ id: string; taskId: string }>();
  const router = useRouter();
  const activeTheme = useTheme<Theme>();
  const {
    viewState,
    households,
    currentHouseholdId,
    accessChangedHouseholdName,
    refreshHouseholds,
  } = useHouseholdContext();

  const [task, setTask] = useState<TaskResponseDto | null>(null);
  const [members, setMembers] = useState<GetHouseholdMemberDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [pendingSeriesAction, setPendingSeriesAction] = useState<PendingSeriesAction | null>(null);
  const [seriesSubmitting, setSeriesSubmitting] = useState<SeriesScope | null>(null);
  const [seriesError, setSeriesError] = useState<string | null>(null);

  const householdId = id ?? currentHouseholdId;
  const currentHousehold = households.find((h) => h.id === currentHouseholdId) ?? null;

  const memberOptions = useMemo(
    () => members.map((m) => ({ userId: m.userId, displayName: m.displayName })),
    [members],
  );

  const fetchTask = useCallback(async (showLoading = true) => {
    if (householdId === undefined || householdId === '' || taskId === undefined || taskId === '') return;
    if (showLoading) setLoading(true);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) return;
      const [taskResult, householdResult] = await Promise.all([
        sessionApiClient.getTask(token, householdId, taskId),
        sessionApiClient.getHousehold(token, householdId),
      ]);
      setTask(taskResult);
      setMembers(householdResult.members);
      setSelectedLabelIds((taskResult.labels ?? []).map((l) => l.id));
    } catch {
      // Keep the current authoritative snapshot when a silent refresh fails.
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [householdId, taskId]);

  useEffect(() => {
    void fetchTask();
  }, [fetchTask]);

  const handleSubmit = useCallback(async (data: CreateTaskDto) => {
    if (householdId === undefined || householdId === '' || taskId === undefined || taskId === '') return;
    if (task?.recurrenceRuleId != null) {
      setSeriesError(null);
      setPendingSeriesAction({
        data,
        kind: 'save',
        mode: recurrenceChanged(task.recurrence, data.recurrence)
          ? 'rule-change'
          : 'edit',
      });
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setSubmitError('登录已过期，请重新登录。');
        setSubmitting(false);
        return;
      }
      await sessionApiClient.updateTask(token, householdId, taskId, data);
      // Sync labels: tag with all selected labels (replaces current)
      await sessionApiClient.tagTask(token, householdId, taskId, { labelIds: selectedLabelIds });
      router.back();
    } catch (error: unknown) {
      if (error instanceof ApiClientError) {
        const details = (error.body as { error?: { details?: Array<{ field?: string }> } } | undefined)?.error?.details;
        if (details?.some((d) => d.field === 'assigneeIds')) {
          setSubmitError('存在负责人已不再是该家庭成员，请重新选择负责人。');
        } else if (error.status === 403) {
          setSubmitError('你没有权限编辑这个任务。');
        } else if (error.status === 404) {
          setSubmitError('任务不存在或已被删除。');
        } else {
          setSubmitError('保存失败，请重试。');
        }
      } else {
        setSubmitError('保存失败，请检查网络连接后重试。');
      }
      setSubmitting(false);
    }
  }, [householdId, task, taskId, router, selectedLabelIds]);

  const handleDelete = useCallback(async () => {
    if (householdId === undefined || householdId === '' || taskId === undefined || taskId === '') return;
    setDeleting(true);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) return;
      await sessionApiClient.deleteTask(token, householdId, taskId);
      // Go straight back to the task list, not router.back() — a single
      // pop would land on the now-deleted task's detail screen.
      router.dismissTo(`/households/${encodeURIComponent(householdId)}/tasks`);
    } catch {
      setDeleting(false);
    }
  }, [householdId, taskId, router]);

  const openDelete = useCallback(() => {
    if (task?.recurrenceRuleId != null) {
      setSeriesError(null);
      setPendingSeriesAction({ kind: 'delete', mode: 'delete' });
      return;
    }
    setConfirmDelete(true);
  }, [task]);

  const handleSeriesSelect = useCallback(async (scope: SeriesScope) => {
    if (
      pendingSeriesAction === null ||
      householdId === undefined ||
      householdId === '' ||
      taskId === undefined ||
      taskId === ''
    ) return;
    setSeriesSubmitting(scope);
    setSeriesError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setSeriesError('登录已过期，请重新登录。');
        return;
      }

      if (pendingSeriesAction.kind === 'delete') {
        await sessionApiClient.deleteTaskSeries(token, householdId, taskId, scope);
        setPendingSeriesAction(null);
        router.dismissTo(`/households/${encodeURIComponent(householdId)}/tasks`);
        return;
      }

      if (scope === 'this_only') {
        await sessionApiClient.updateTask(token, householdId, taskId, pendingSeriesAction.data);
      } else {
        await sessionApiClient.updateTaskSeries(
          token,
          householdId,
          taskId,
          taskSeriesUpdate(pendingSeriesAction.data),
        );
      }
      await sessionApiClient.tagTask(token, householdId, taskId, { labelIds: selectedLabelIds });
      setPendingSeriesAction(null);
      router.back();
    } catch (caught: unknown) {
      setSeriesError(
        caught instanceof ApiClientError && caught.status === 404
          ? SERIES_MISSING
          : SERIES_FAILURE,
      );
      await fetchTask(false);
    } finally {
      setSeriesSubmitting(null);
    }
  }, [fetchTask, householdId, pendingSeriesAction, router, selectedLabelIds, taskId]);

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

  return (
    <AppShell accessibilityLabel="编辑任务" title="编辑任务" showBack showProfile>
      <Stack gap={4}>
        <HouseholdHeader householdName={currentHousehold?.name ?? ''} onOpenSwitcher={() => {}} />

        {loading ? (
          <View style={{ alignItems: 'center', paddingVertical: activeTheme.spacing[6] }}>
            <ActivityIndicator color={activeTheme.colors.coral} />
          </View>
        ) : task !== null ? (
          <Stack gap={4}>
            {submitError !== null && (
              <View style={{
                backgroundColor: activeTheme.colors.destructiveSoft,
                padding: activeTheme.spacing[4],
                borderRadius: activeTheme.borderRadii.md,
              }}>
                <Text variant="bodySm" color="destructive">{submitError}</Text>
              </View>
            )}
            <TaskForm
              initial={task}
              members={memberOptions}
              onSubmit={handleSubmit}
              onCancel={() => router.back()}
              submitLabel="保存修改"
              isSubmitting={submitting}
              householdId={householdId}
              selectedLabelIds={selectedLabelIds}
              onLabelChange={setSelectedLabelIds}
            />
            {/* Delete section */}
            <View style={{ marginTop: activeTheme.spacing[4], borderTopWidth: 1, borderTopColor: activeTheme.colors.border, paddingTop: activeTheme.spacing[4] }}>
              {!confirmDelete ? (
                <Pressable
                  onPress={openDelete}
                  disabled={deleting}
                  hitSlop={activeTheme.spacing[1]}
                  style={({ pressed }) => ({
                    alignItems: 'center',
                    paddingVertical: activeTheme.spacing[3],
                    borderRadius: activeTheme.borderRadii.sm,
                    borderWidth: 1,
                    borderColor: activeTheme.colors.destructive,
                    opacity: pressed ? 0.7 : 1,
                  })}
                  accessibilityLabel="删除任务"
                >
                  <Text variant="button" color="destructive">
                    删除任务
                  </Text>
                </Pressable>
              ) : (
                <Stack gap={3}>
                  <Text variant="bodySm" color="destructive">
                    确定要删除这个任务吗？此操作不可撤销。
                  </Text>
                  <View style={{ flexDirection: 'row', gap: activeTheme.spacing[3] }}>
                    <Pressable
                      onPress={() => setConfirmDelete(false)}
                      disabled={deleting}
                      hitSlop={activeTheme.spacing[1]}
                      style={({ pressed }) => ({
                        flex: 1,
                        alignItems: 'center',
                        paddingVertical: activeTheme.spacing[3],
                        borderRadius: activeTheme.borderRadii.sm,
                        borderWidth: 1,
                        borderColor: activeTheme.colors.border,
                        opacity: pressed ? 0.7 : 1,
                      })}
                      accessibilityLabel="取消删除"
                    >
                      <Text variant="button" color="ink">取消</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleDelete}
                      disabled={deleting}
                      hitSlop={activeTheme.spacing[1]}
                      style={({ pressed }) => ({
                        flex: 1,
                        alignItems: 'center',
                        paddingVertical: activeTheme.spacing[3],
                        borderRadius: activeTheme.borderRadii.sm,
                        backgroundColor: deleting ? activeTheme.colors.disabled : activeTheme.colors.destructive,
                        opacity: pressed ? 0.7 : 1,
                      })}
                      accessibilityLabel="确认删除任务"
                    >
                      <Text variant="button" color="surface">
                        {deleting ? '删除中…' : '确认删除'}
                      </Text>
                    </Pressable>
                  </View>
                </Stack>
              )}
            </View>
            <SeriesScopeSheet
              error={seriesError}
              mode={pendingSeriesAction?.mode ?? 'edit'}
              onClose={() => {
                setPendingSeriesAction(null);
                setSeriesError(null);
              }}
              onSelect={(scope) => void handleSeriesSelect(scope)}
              submitting={seriesSubmitting}
              visible={pendingSeriesAction !== null}
            />
          </Stack>
        ) : (
          <Text variant="bodySm" color="inkMuted">任务未找到。</Text>
        )}
      </Stack>
    </AppShell>
  );
}
