import { hasRecurrenceFieldErrors } from '../../../../../../src/features/recurrence/recurrence-options';
import { useEditWindowExit } from '../../../../../../src/ui/route-window';
import { TaskWindow } from '../../../../../../src/features/tasks/task-window';
import { useEditConflict, captureEditBaseline } from '../../../../../../src/ui/edit-conflict';
import { useWorkspaceStore, useWorkspaceState } from '../../../../../../src/ui/workspace-state';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiClientError } from '@muchakucha/api-client';
import type {
  TaskResponseDto,
  GetHouseholdMemberDto,
  UpdateSeriesDto,
} from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { useHouseholdContext } from '../../../../../../src/features/households/household-context';
import { TaskForm } from '../../../../../../src/features/tasks/task-form';
import { seriesScopeModeFor } from '../../../../../../src/features/recurrence/series-scope-mode';
import {
  SeriesScopeContent,
  seriesScopeTitle,
  type SeriesScope,
  type SeriesScopeMode,
} from '../../../../../../src/features/recurrence/series-scope-sheet';
import {
  AccessChangedPanel,
  AppShell,
  HouseholdContextNote,
} from '../../../../../../src/ui/household-components';
import { Banner, LoadError, LoadingState, Stack } from '../../../../../../src/ui/primitives';
import type { CreateTaskDto } from '@muchakucha/api-client';

type PendingSeriesAction =
  { kind: 'save'; data: CreateTaskDto; mode: SeriesScopeMode };

const SERIES_FAILURE = '没有完成。这个重复安排没有发生任何改变，请重试。';
const SERIES_MISSING = '这一次重复已经被其他人删除了。返回后可以看到最新的安排。';

function taskSeriesUpdate(data: CreateTaskDto, labelIds: string[]): Omit<UpdateSeriesDto, 'expectedUpdatedAt' | 'expectedRuleUpdatedAt'> {
  const status = data.status;
  const priority = data.priority;
  return {
    title: data.title,
    // Without this the server copies the labels off the pre-edit occurrence
    // and silently discards the user's label edits.
    labelIds,
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
  const workspace = useWorkspaceStore();
  const draftPrefix = `draft:${id}:tasks:${taskId}:`;
  const router = useRouter();
  const exitEdit = useEditWindowExit('tasks', taskId);
  const exitAllowed = useRef(false);
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedLabelIds, setSelectedLabelIds] = useWorkspaceState<string[]>(draftPrefix + 'labels', []);
  const [pendingSeriesAction, setPendingSeriesAction] = useState<PendingSeriesAction | null>(null);
  const [seriesSubmitting, setSeriesSubmitting] = useState<SeriesScope | null>(null);
  const [seriesError, setSeriesError] = useState<string | null>(null);

  const householdId = id ?? currentHouseholdId;
  const currentHousehold = households.find((h) => h.id === (id ?? currentHouseholdId)) ?? null;


  const memberOptions = useMemo(
    () => members.map((m) => ({ userId: m.userId, displayName: m.displayName })),
    [members],
  );

  const conflict = useEditConflict(draftPrefix, task, async () => {
    const token = await sessionTransport.getAccessToken();
    if (token === null) throw new Error('Session expired');
    const [latest, household] = await Promise.all([sessionApiClient.getTask(token, id!, taskId!), sessionApiClient.getHousehold(token, id!)]);
    return { ...latest, assigneeNames: latest.assigneeIds.map(userId => household.members.find(member => member.userId === userId)?.displayName ?? '已退出的成员') };
  }, setTask);

  const fetchTask = useCallback(async (showLoading = true) => {
    if (householdId === undefined || householdId === '' || taskId === undefined || taskId === '') return;
    if (showLoading) { setLoading(true); setLoadError(null); }
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        if (showLoading) setLoadError('登录已过期，请重新登录。');
        return;
      }
      const [taskResult, householdResult] = await Promise.all([
        sessionApiClient.getTask(token, householdId, taskId),
        sessionApiClient.getHousehold(token, householdId),
      ]);
      captureEditBaseline(workspace, draftPrefix, taskResult);
      setTask(taskResult);
      setMembers(householdResult.members);
      workspace.seed(draftPrefix + 'labels', (taskResult.labels ?? []).map((l) => l.id));
    } catch {
      // Keep the current authoritative snapshot when a silent refresh fails.
      if (showLoading) setLoadError('无法加载任务，请重试或确认它是否已被删除。');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [householdId, taskId, workspace, draftPrefix]);

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
        mode: seriesScopeModeFor(task.recurrence, data.recurrence),
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
      await sessionApiClient.updateTask(token, householdId, taskId, { ...data, ...conflict.precondition, labelIds: selectedLabelIds });
      workspace.clear(draftPrefix);
      exitAllowed.current = true;
      exitEdit();
    } catch (error: unknown) {
      if (hasRecurrenceFieldErrors(error)) {
        // The form shows these next to the repeat settings it owns.
        setSubmitting(false);
        throw error;
      }
      if (conflict.handle(error)) {
        setSubmitError(null);
      } else if (error instanceof ApiClientError) {
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
  }, [householdId, task, taskId, router, selectedLabelIds, workspace, draftPrefix, conflict, exitEdit]);

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

      if (scope === 'this_only') {
        await sessionApiClient.updateTask(token, householdId, taskId, { ...pendingSeriesAction.data, ...conflict.precondition, labelIds: selectedLabelIds });
      } else {
        await sessionApiClient.updateTaskSeries(
          token,
          householdId,
          taskId,
          { ...taskSeriesUpdate(pendingSeriesAction.data, selectedLabelIds), ...conflict.seriesPrecondition },
        );
      }
      setPendingSeriesAction(null);
      workspace.clear(draftPrefix);
      if (scope === 'this_only') {
        exitAllowed.current = true;
        exitEdit();
      } else {
        exitAllowed.current = true;
        router.dismissTo(`/households/${encodeURIComponent(householdId)}/tasks`);
      }
    } catch (caught: unknown) {
      if (conflict.handle(caught)) {
        setPendingSeriesAction(null);
        setSeriesError(null);
        return;
      }
      setSeriesError(
        caught instanceof ApiClientError && caught.status === 404
          ? SERIES_MISSING
          : SERIES_FAILURE,
      );
      await fetchTask(false);
    } finally {
      setSeriesSubmitting(null);
    }
  }, [fetchTask, householdId, pendingSeriesAction, router, selectedLabelIds, taskId, workspace, draftPrefix, conflict, exitEdit]);

  const closeEdit = () => {
    if (pendingSeriesAction) { setPendingSeriesAction(null); setSeriesError(null); }
    else exitEdit();
  };

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
    <TaskWindow size={pendingSeriesAction ? 'standard' : 'editor'} title={pendingSeriesAction ? seriesScopeTitle(pendingSeriesAction.mode) : "编辑任务"} busy={submitting || seriesSubmitting !== null} onClose={closeEdit} onBackStep={pendingSeriesAction ? closeEdit : undefined} exitAllowed={exitAllowed}>
      <Stack gap={4}>
        {pendingSeriesAction ? null : <HouseholdContextNote householdName={currentHousehold?.name ?? ''} />}

        {pendingSeriesAction ? <SeriesScopeContent
          error={seriesError} mode={pendingSeriesAction.mode} onClose={closeEdit}
          onSelect={scope => void handleSeriesSelect(scope)} submitting={seriesSubmitting}
        /> : loading ? <LoadingState label="正在加载任务" /> : task !== null ? (
          <Stack gap={4}>
            {submitError !== null && <Banner>{submitError}</Banner>}
            {conflict.panel}
            <TaskForm
            draftKey={draftPrefix + 'form'}
              initial={task}
              members={memberOptions}
              onSubmit={handleSubmit}
              onCancel={closeEdit}
              submitLabel="保存"
              isSubmitting={submitting}
              householdId={householdId}
              selectedLabelIds={selectedLabelIds}
              onLabelChange={setSelectedLabelIds}
            />
          </Stack>
        ) : (
          <Stack gap={3}>
            <LoadError message={loadError ?? '任务未找到或已被删除。'} onRetry={() => void fetchTask()} />
          </Stack>
        )}
      </Stack>
    </TaskWindow>
  );
}
