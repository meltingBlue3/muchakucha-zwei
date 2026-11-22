import { useCallback, useRef, useState } from 'react';
import type { View } from 'react-native';
import { ApiClientError, type DeleteVersion, type EventResponseDto, type NoteResponseDto, type TaskResponseDto } from '@muchakucha/api-client';
import { useTranslation } from '../../i18n';
import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { SeriesScopeContent, type SeriesScope } from '../recurrence/series-scope-sheet';
import { Banner, ConfirmActions, Stack, Text } from '../../ui/primitives';
import { useWorkspaceStore } from '../../ui/workspace-state';
import { formatDate, isDateValue, parseDateValue } from '../../ui/date-values';
import type { RouteWindowProps } from '../../ui/route-window';
import { formatDateRange } from '../events/calendar-utils';
import type { DeletableResource } from './use-content-delete';

export type DeletableContent = TaskResponseDto | EventResponseDto | NoteResponseDto;

/** What the question names, and the version the person saw when they were asked. */
type DeleteDate = { dueDate: string } | Pick<EventResponseDto, 'startTime' | 'endTime' | 'allDay'>;
export interface DeleteTarget { title: string; date: DeleteDate | null; recurring: boolean; version: DeleteVersion }
export type DeleteFailure = 'auth:errors.sessionExpired' | 'accessLost' | 'removed' | 'changed' | 'failed';

function deleteTargetOf(content: DeletableContent): DeleteTarget {
  const ruleVersion = 'recurrence' in content ? content.recurrence?.updatedAt : undefined;
  const dueDate = 'assigneeIds' in content ? content.dueDate ?? content.occurrenceDate : undefined;
  const date = 'startTime' in content ? { startTime: content.startTime, endTime: content.endTime, allDay: content.allDay }
    : dueDate ? { dueDate } : null;
  return {
    title: content.title,
    date,
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
  trigger: React.RefObject<View | null>;
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
  const trigger = useRef<View>(null);
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

  return { target, submitting, error, trigger, open, cancel, confirm };
}

export function contentDeleteConfirmation(resource: DeletableResource, deletion: ContentDeletion, title: string): RouteWindowProps['centeredConfirmation'] {
  if (deletion.target === null) return undefined;
  return { title, trigger: deletion.trigger, onClose: deletion.cancel, content: <DeleteContentQuestion resource={resource} deletion={deletion} onCancel={deletion.cancel} /> };
}

export function DeleteContentQuestion({ resource, deletion, onCancel }: { resource: DeletableResource; deletion: ContentDeletion; onCancel(): void }) {
  const { t } = useTranslation(['deleteContent', 'auth']);
  const { target, submitting, error } = deletion;
  if (target === null) return null;
  const confirmLabel = t(`title.${resource}`);
  const errorText = error === null ? null : t(error);
  const confirmDisabled = error === 'accessLost' || error === 'removed';
  const date = target.date;
  const when = date === null ? null : 'dueDate' in date
    ? formatDate(isDateValue(date.dueDate) ? parseDateValue(date.dueDate) : new Date(date.dueDate))
    : formatDateRange(date.startTime, date.endTime, date.allDay);
  return <Stack gap={4}>
    <Stack gap={1}>
      <Text variant="label">{target.title}</Text>
      {when ? <Text variant="bodySm" color="inkMuted">{when}</Text> : null}
    </Stack>
    {target.recurring ? <SeriesScopeContent key={`${target.version.expectedUpdatedAt}:${target.version.expectedRuleUpdatedAt ?? ''}`} mode="delete"
      confirmLabel={confirmLabel} confirmDisabled={confirmDisabled} error={errorText} submitting={submitting === 'single' ? null : submitting} onClose={onCancel} onSelect={scope => void deletion.confirm(scope)} />
      : <>
        <Text variant="bodySm" color="inkMuted">{t('warning')}</Text>
        {errorText ? <Banner>{errorText}</Banner> : null}
        <ConfirmActions confirmLabel={confirmLabel} destructive alignEnd confirmDisabled={confirmDisabled} busy={submitting !== null} onCancel={onCancel} onConfirm={() => void deletion.confirm()} />
      </>}
  </Stack>;
}
