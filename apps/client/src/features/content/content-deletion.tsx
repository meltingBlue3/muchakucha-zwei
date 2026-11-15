import { useCallback, useRef, useState } from 'react';
import { ApiClientError, type DeleteVersion, type EventResponseDto, type NoteResponseDto, type TaskResponseDto } from '@muchakucha/api-client';
import { useTranslation } from '../../i18n';
import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { SeriesScopeContent, type SeriesScope } from '../recurrence/series-scope-sheet';
import { Banner, ConfirmActions, Stack, Text } from '../../ui/primitives';
import { useWorkspaceStore } from '../../ui/workspace-state';
import type { DeletableResource } from './use-content-delete';

export type DeletableContent = TaskResponseDto | EventResponseDto | NoteResponseDto;

/** What the question names, and the version the person saw when they were asked. */
export interface DeleteTarget { title: string; recurring: boolean; version: DeleteVersion }
export type DeleteFailure = 'auth:errors.sessionExpired' | 'accessLost' | 'removed' | 'changed' | 'failed';

function deleteTargetOf(content: DeletableContent): DeleteTarget {
  const ruleVersion = 'recurrence' in content ? content.recurrence?.updatedAt : undefined;
  return {
    title: content.title,
    recurring: 'recurrenceRuleId' in content && content.recurrenceRuleId != null,
    version: ruleVersion ? { expectedUpdatedAt: content.updatedAt, expectedRuleUpdatedAt: ruleVersion } : { expectedUpdatedAt: content.updatedAt },
  };
}

export function readDeletableContent(resource: DeletableResource, token: string, householdId: string, contentId: string): Promise<DeletableContent> {
  return resource === 'tasks' ? sessionApiClient.getTask(token, householdId, contentId)
    : resource === 'events' ? sessionApiClient.getEvent(token, householdId, contentId)
      : sessionApiClient.getNote(token, householdId, contentId);
}

export interface ContentDeletion {
  /** Set while the question is asked. */
  target: DeleteTarget | null;
  submitting: SeriesScope | 'single' | null;
  error: DeleteFailure | null;
  /** Asks about this content as it was just read. */
  open(content: DeletableContent): void;
  cancel(): void;
  confirm(scope?: SeriesScope): Promise<void>;
}

/**
 * Deleting a task, event or note after asking first. The delete carries the
 * version the question showed; when someone changed it since, the latest
 * content is read again and the question is asked once more. `onDeleted` runs
 * after the drafts of the deleted content are cleared.
 */
export function useContentDeletion(resource: DeletableResource, householdId: string | undefined, contentId: string | undefined, onDeleted: () => void): ContentDeletion {
  const workspace = useWorkspaceStore();
  const [target, setTarget] = useState<DeleteTarget | null>(null);
  const [submitting, setSubmitting] = useState<SeriesScope | 'single' | null>(null);
  const [error, setError] = useState<DeleteFailure | null>(null);
  const pending = useRef(false);
  const deleted = useRef(onDeleted);
  deleted.current = onDeleted;

  const open = useCallback((content: DeletableContent) => {
    setError(null);
    setTarget(deleteTargetOf(content));
  }, []);
  const cancel = useCallback(() => {
    if (pending.current) return;
    setError(null);
    setTarget(null);
  }, []);
  const confirm = useCallback(async (scope?: SeriesScope) => {
    if (!householdId || !contentId || target === null || pending.current) return;
    pending.current = true;
    setSubmitting(scope ?? 'single');
    setError(null);
    let token: string | null = null;
    try {
      token = await sessionTransport.getAccessToken();
      if (token === null) { setError('auth:errors.sessionExpired'); return; }
      const { version } = target;
      if (resource === 'tasks') {
        if (scope) await sessionApiClient.deleteTaskSeries(token, householdId, contentId, scope, version);
        else await sessionApiClient.deleteTask(token, householdId, contentId, version);
      } else if (resource === 'events') {
        if (scope) await sessionApiClient.deleteEventSeries(token, householdId, contentId, scope, version);
        else await sessionApiClient.deleteEvent(token, householdId, contentId, version);
      } else await sessionApiClient.deleteNote(token, householdId, contentId, version);
      workspace.clear(`draft:${householdId}:${resource}:${contentId}:`);
      deleted.current();
    } catch (caught: unknown) {
      if (caught instanceof ApiClientError && caught.status === 409 && token !== null) {
        // Someone changed it after it was read: show what it is now and ask again.
        try {
          setTarget(deleteTargetOf(await readDeletableContent(resource, token, householdId, contentId)));
          setError('changed');
        } catch (reload: unknown) {
          setError(reload instanceof ApiClientError && reload.status === 404 ? 'removed' : 'failed');
        }
        return;
      }
      setError(caught instanceof ApiClientError && caught.status === 403
        ? 'accessLost'
        : caught instanceof ApiClientError && caught.status === 404
          ? 'removed'
          : 'failed');
    } finally {
      pending.current = false;
      setSubmitting(null);
    }
  }, [householdId, contentId, target, resource, workspace]);

  return { target, submitting, error, open, cancel, confirm };
}

/** The question itself: one 确认删除, or for a repeat which occurrences go. */
export function DeleteContentQuestion({ resource, deletion, onCancel }: { resource: DeletableResource; deletion: ContentDeletion; onCancel(): void }) {
  const { t } = useTranslation(['deleteContent', 'auth']);
  const { target, submitting, error } = deletion;
  if (target === null) return null;
  const confirmLabel = t(`confirm.${resource}`);
  const errorText = error === null ? null : t(error);
  return target.recurring
    ? <SeriesScopeContent mode="delete" confirmLabel={confirmLabel} error={errorText} submitting={submitting === 'single' ? null : submitting} onClose={onCancel} onSelect={scope => void deletion.confirm(scope)} />
    : <Stack gap={4}>
      <Text>{t('question', { title: target.title })}</Text>
      {errorText ? <Banner>{errorText}</Banner> : null}
      <ConfirmActions cancelLabel={t('cancel')} confirmLabel={confirmLabel} destructive busy={submitting !== null} onCancel={onCancel} onConfirm={() => void deletion.confirm()} />
    </Stack>;
}
