import { useTranslation } from '../../../../../../src/i18n';
import { notifyContentChanged } from '../../../../../../src/features/content/content-changes';
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
import { sameIds, saveOwnReminder } from '../../../../../../src/features/reminders/own-reminder';
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
  const { t } = useTranslation(['tasks', 'common', 'auth', 'households', 'reminders']);
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
  const [loadError, setLoadError] = useState<'auth:errors.sessionExpired' | 'editLoadError' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<Awaited<ReturnType<typeof saveOwnReminder>> | 'auth:errors.sessionExpired' | 'assigneeRemoved' | 'editDenied' | 'missingOnSave' | 'saveRetry' | 'saveConnection'>(null);
  const [selectedLabelIds, setSelectedLabelIds] = useWorkspaceState<string[]>(draftPrefix + 'labels', []);
  const [pendingSeriesAction, setPendingSeriesAction] = useState<PendingSeriesAction | null>(null);
  const [seriesSubmitting, setSeriesSubmitting] = useState<SeriesScope | null>(null);
  const [seriesError, setSeriesError] = useState<'auth:errors.sessionExpired' | 'seriesMissing' | 'seriesFailure' | null>(null);

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
    return { ...latest, assigneeNames: latest.assigneeIds.map(userId => household.members.find(member => member.userId === userId)?.displayName ?? t('formerMember')) };
  }, setTask);

  const fetchTask = useCallback(async (showLoading = true) => {
    if (householdId === undefined || householdId === '' || taskId === undefined || taskId === '') return;
    if (showLoading) { setLoading(true); setLoadError(null); }
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        if (showLoading) setLoadError('auth:errors.sessionExpired');
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
      if (showLoading) setLoadError('editLoadError');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [householdId, taskId, workspace, draftPrefix]);

  useEffect(() => {
    void fetchTask();
  }, [fetchTask]);

  const handleSubmit = useCallback(async ({ myReminder, ...data }: CreateTaskDto, { contentChanged }: { contentChanged: boolean }) => {
    if (householdId === undefined || householdId === '' || taskId === undefined || taskId === '') return;
    setSubmitting(true);
    setSubmitError(null);
    const reminderError = await saveOwnReminder('task', householdId, taskId, myReminder, task?.myReminder);
    if (reminderError !== null) {
      setSubmitError(reminderError);
      setSubmitting(false);
      return;
    }
    // Only the reminder changed: nothing shared to save, no occurrences to choose.
    if (!contentChanged && sameIds(selectedLabelIds, (task?.labels ?? []).map((label) => label.id))) {
      workspace.clear(draftPrefix);
      notifyContentChanged(id);
      exitAllowed.current = true;
      exitEdit();
      return;
    }
    if (task?.recurrenceRuleId != null) {
      setSubmitting(false);
      setSeriesError(null);
      setPendingSeriesAction({
        data,
        kind: 'save',
        mode: seriesScopeModeFor(task.recurrence, data.recurrence),
      });
      return;
    }
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setSubmitError('auth:errors.sessionExpired');
        setSubmitting(false);
        return;
      }
      await sessionApiClient.updateTask(token, householdId, taskId, { ...data, ...conflict.precondition, labelIds: selectedLabelIds });
      workspace.clear(draftPrefix);
      notifyContentChanged(id);
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
          setSubmitError('assigneeRemoved');
        } else if (error.status === 403) {
          setSubmitError('editDenied');
        } else if (error.status === 404) {
          setSubmitError('missingOnSave');
        } else {
          setSubmitError('saveRetry');
        }
      } else {
        setSubmitError('saveConnection');
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
        setSeriesError('auth:errors.sessionExpired');
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
      notifyContentChanged(id);
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
          ? 'seriesMissing'
          : 'seriesFailure',
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
      <AppShell accessibilityLabel={t('households:accessChanged')}>
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
    <TaskWindow draftPrefix={draftPrefix} size={pendingSeriesAction ? 'standard' : 'editor'} title={pendingSeriesAction ? seriesScopeTitle(pendingSeriesAction.mode) : t('edit')} busy={submitting || seriesSubmitting !== null} onClose={closeEdit} onBackStep={pendingSeriesAction ? closeEdit : undefined} exitAllowed={exitAllowed}>
      <Stack gap={4}>
        {pendingSeriesAction ? null : <HouseholdContextNote householdName={currentHousehold?.name ?? ''} />}

        {pendingSeriesAction ? <SeriesScopeContent
          error={seriesError === null ? null : t(seriesError)} mode={pendingSeriesAction.mode} onClose={closeEdit}
          onSelect={scope => void handleSeriesSelect(scope)} submitting={seriesSubmitting}
        /> : loading ? <LoadingState label={t('loading')} /> : task !== null ? (
          <Stack gap={4}>
            {submitError !== null && <Banner>{t(submitError)}</Banner>}
            {conflict.panel}
            <TaskForm
            draftKey={draftPrefix + 'form'}
              initial={task}
              members={memberOptions}
              onSubmit={handleSubmit}
              onCancel={closeEdit}
              submitLabel={t('common:save')}
              isSubmitting={submitting}
              householdId={householdId}
              selectedLabelIds={selectedLabelIds}
              onLabelChange={setSelectedLabelIds}
            />
          </Stack>
        ) : (
          <Stack gap={3}>
            <LoadError message={t(loadError ?? 'notFound')} onRetry={() => void fetchTask()} />
          </Stack>
        )}
      </Stack>
    </TaskWindow>
  );
}
