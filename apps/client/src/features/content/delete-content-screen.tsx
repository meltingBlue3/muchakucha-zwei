import { useTranslation } from '../../i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ApiClientError, type DeleteVersion } from '@muchakucha/api-client';
import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { TaskWindow } from '../tasks/task-window';
import { EventWindow } from '../events/event-window';
import { NoteWindow } from '../notes/note-window';
import { SeriesScopeContent, type SeriesScope } from '../recurrence/series-scope-sheet';
import { useRouteWindowClose } from '../../ui/route-window';
import { Banner, ConfirmActions, LoadError, LoadingState, Stack, Text } from '../../ui/primitives';
import { useWorkspaceStore } from '../../ui/workspace-state';
import { canDeleteContent, type DeletableResource } from './use-content-delete';

const windows = { tasks: TaskWindow, events: EventWindow, notes: NoteWindow };
interface DeleteTarget { title: string; recurring: boolean; allowed: boolean; version: DeleteVersion }

export function DeleteContentScreen({ resource }: { resource: DeletableResource }) {
  const { t } = useTranslation(['deleteContent', 'auth']);
  const { id, taskId, eventId, noteId } = useLocalSearchParams<{ id: string; taskId?: string; eventId?: string; noteId?: string }>();
  const contentId = resource === 'tasks' ? taskId : resource === 'events' ? eventId : noteId;
  const { close } = useRouteWindowClose(resource);
  const workspace = useWorkspaceStore();
  const exitAllowed = useRef(false);
  const [target, setTarget] = useState<DeleteTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<SeriesScope | 'single' | null>(null);
  const [error, setError] = useState<'auth:errors.sessionExpired' | 'loadFailed' | 'accessLost' | 'removed' | 'changed' | 'failed' | null>(null);
  const confirmLabel = t(`confirm.${resource}`);
  const errorText = error === 'loadFailed' ? t(`loadFailed.${resource}`) : error === null ? null : t(error);
  const Window = windows[resource];
  // `notice` survives the reload: after a conflict the person sees the latest content and why it was reloaded.
  const load = useCallback(async (notice: 'changed' | null = null) => {
    setLoading(true);
    setError(null);
    setTarget(null);
    try {
      if (!id || !contentId) throw new Error('Missing resource');
      const token = await sessionTransport.getAccessToken();
      if (token === null) { setError('auth:errors.sessionExpired'); return; }
      const [content, household] = await Promise.all([
        resource === 'tasks' ? sessionApiClient.getTask(token, id, contentId)
          : resource === 'events' ? sessionApiClient.getEvent(token, id, contentId)
            : sessionApiClient.getNote(token, id, contentId),
        sessionApiClient.getHousehold(token, id),
      ]);
      const actor = household.members.find(member => member.isCurrentUser);
      const ruleVersion = 'recurrence' in content ? content.recurrence?.updatedAt : undefined;
      setTarget({
        title: content.title,
        recurring: 'recurrenceRuleId' in content && content.recurrenceRuleId != null,
        allowed: canDeleteContent(actor?.role, actor?.userId, content.createdBy),
        version: ruleVersion ? { expectedUpdatedAt: content.updatedAt, expectedRuleUpdatedAt: ruleVersion } : { expectedUpdatedAt: content.updatedAt },
      });
      setError(notice);
    } catch {
      setError('loadFailed');
    } finally { setLoading(false); }
  }, [id, contentId, resource]);
  useEffect(() => { void load(); }, [load]);

  const remove = async (scope?: SeriesScope) => {
    if (!id || !contentId || !target?.allowed || submitting !== null) return;
    setSubmitting(scope ?? 'single');
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) { setError('auth:errors.sessionExpired'); return; }
      const { version } = target;
      if (resource === 'tasks') {
        if (scope) await sessionApiClient.deleteTaskSeries(token, id, contentId, scope, version);
        else await sessionApiClient.deleteTask(token, id, contentId, version);
      } else if (resource === 'events') {
        if (scope) await sessionApiClient.deleteEventSeries(token, id, contentId, scope, version);
        else await sessionApiClient.deleteEvent(token, id, contentId, version);
      } else await sessionApiClient.deleteNote(token, id, contentId, version);
      workspace.clear(`draft:${id}:${resource}:${contentId}:`);
      exitAllowed.current = true;
      close();
    } catch (caught: unknown) {
      // Someone changed it after this window loaded it: show what it is now and ask again.
      if (caught instanceof ApiClientError && caught.status === 409) { void load('changed'); return; }
      setError(caught instanceof ApiClientError && caught.status === 403
        ? 'accessLost'
        : caught instanceof ApiClientError && caught.status === 404
          ? 'removed'
          : 'failed');
    } finally { setSubmitting(null); }
  };

  return <Window size="standard" title={t(`title.${resource}`)} busy={submitting !== null} onClose={close} exitAllowed={exitAllowed}>
    {loading ? <LoadingState label={t(`loading.${resource}`)} /> : target === null ? <LoadError message={errorText ?? t(`missing.${resource}`)} onRetry={() => void load()} /> : !target.allowed ? <Text accessibilityRole="alert">{t(`denied.${resource}`)}</Text> : <Stack gap={4}>
      {target.recurring ? <SeriesScopeContent mode="delete" confirmLabel={confirmLabel} error={errorText} submitting={submitting === 'single' ? null : submitting} onClose={close} onSelect={scope => void remove(scope)} /> : <>
        <Text>{t('question', { title: target.title })}</Text>
        {errorText ? <Banner>{errorText}</Banner> : null}
        <ConfirmActions cancelLabel={t('cancel')} confirmLabel={confirmLabel} destructive busy={submitting !== null} onCancel={close} onConfirm={() => void remove()} />
      </>}
    </Stack>}
  </Window>;
}
