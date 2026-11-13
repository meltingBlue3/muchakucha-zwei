import { useTranslation } from '../../../../../../src/i18n';
import { notifyContentChanged } from '../../../../../../src/features/content/content-changes';
import { hasRecurrenceFieldErrors } from '../../../../../../src/features/recurrence/recurrence-options';
import { useHouseholdContext } from '../../../../../../src/features/households/household-context';
import { HouseholdContextNote } from '../../../../../../src/ui/household-components';
import { useEditWindowExit } from '../../../../../../src/ui/route-window';
import { EventWindow } from '../../../../../../src/features/events/event-window';
import { useEditConflict, captureEditBaseline } from '../../../../../../src/ui/edit-conflict';
import { useWorkspaceStore, useWorkspaceState } from '../../../../../../src/ui/workspace-state';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError } from '@muchakucha/api-client';
import type { CreateEventDto, EventResponseDto, UpdateSeriesDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { EventForm } from '../../../../../../src/features/events/event-form';
import { seriesScopeModeFor } from '../../../../../../src/features/recurrence/series-scope-mode';
import { sameIds, saveOwnReminder } from '../../../../../../src/features/reminders/own-reminder';
import {
  SeriesScopeContent,
  seriesScopeTitle,
  type SeriesScope,
  type SeriesScopeMode,
} from '../../../../../../src/features/recurrence/series-scope-sheet';
import { Banner, LoadError, LoadingState, Stack } from '../../../../../../src/ui/primitives';

type PendingSeriesAction =
  { kind: 'save'; data: CreateEventDto; mode: SeriesScopeMode };

/**
 * Projects the form payload onto the series-update contract by naming every
 * forwarded field. The two types are structurally assignable today, so passing
 * a CreateEventDto straight through compiles — but the global validation pipe
 * runs with forbidNonWhitelisted, so the first field added to CreateEventDto
 * would turn every 此后所有 edit into a runtime 400 with no compile-time
 * signal.
 */
function eventSeriesUpdate(data: CreateEventDto, labelIds: string[]): Omit<UpdateSeriesDto, 'expectedUpdatedAt' | 'expectedRuleUpdatedAt'> {
  return {
    title: data.title,
    // Without this the server copies the labels off the pre-edit occurrence
    // and silently discards the user's label edits.
    labelIds,
    ...(data.description === undefined ? {} : { description: data.description }),
    startTime: data.startTime,
    endTime: data.endTime,
    ...(data.allDay === undefined ? {} : { allDay: data.allDay }),
    ...(data.location === undefined ? {} : { location: data.location }),
    ...(data.recurrence === undefined ? {} : { recurrence: data.recurrence }),
  };
}

export default function EditEventRoute() {
  const { t } = useTranslation(['events', 'common', 'tasks', 'auth', 'reminders']);
  const { id, eventId } = useLocalSearchParams<{ id: string; eventId: string }>();
  const { households } = useHouseholdContext();
  const householdName = households.find(household => household.id === id)?.name ?? '';
  const workspace = useWorkspaceStore();
  const draftPrefix = `draft:${id}:events:${eventId}:`;
  const router = useRouter();
  const exitEdit = useEditWindowExit('events', eventId);
  const exitAllowed = useRef(false);
  const [event, setEvent] = useState<EventResponseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<'auth:errors.sessionExpired' | 'detailLoadError' | 'tasks:saveRetry' | 'reminders:saveFailed' | null>(null);
  const [selectedLabelIds, setSelectedLabelIds] = useWorkspaceState<string[]>(draftPrefix + 'labels', []);
  const [pendingSeriesAction, setPendingSeriesAction] = useState<PendingSeriesAction | null>(null);
  const [seriesSubmitting, setSeriesSubmitting] = useState<SeriesScope | null>(null);
  const [seriesError, setSeriesError] = useState<'auth:errors.sessionExpired' | 'tasks:seriesMissing' | 'tasks:seriesFailure' | null>(null);


  const conflict = useEditConflict(draftPrefix, event, async () => {
    const token = await sessionTransport.getAccessToken();
    if (token === null) throw new Error('Session expired');
    return sessionApiClient.getEvent(token, id!, eventId!);
  }, setEvent);

  const fetchEvent = useCallback(async (showLoading = true) => {
    if (id === undefined || eventId === undefined) return;
    if (showLoading) { setLoading(true); setError(null); }
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setError('auth:errors.sessionExpired');
        return;
      }
      const result = await sessionApiClient.getEvent(token, id, eventId);
      captureEditBaseline(workspace, draftPrefix, result);
      setEvent(result);
      workspace.seed(draftPrefix + 'labels', (result.labels ?? []).map((l) => l.id));
    } catch {
      if (showLoading) setError('detailLoadError');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [id, eventId, workspace, draftPrefix]);

  useEffect(() => {
    void fetchEvent();
  }, [fetchEvent]);

  const handleSubmit = useCallback(
    async ({ myReminder, ...data }: CreateEventDto, { contentChanged }: { contentChanged: boolean }) => {
      if (id === undefined || eventId === undefined) return;
      setIsSubmitting(true);
      setError(null);
      const reminderError = await saveOwnReminder('event', id, eventId, myReminder, event?.myReminder);
      if (reminderError !== null) {
        setError(reminderError);
        setIsSubmitting(false);
        return;
      }
      // Only the reminder changed: nothing shared to save, no occurrences to choose.
      if (!contentChanged && sameIds(selectedLabelIds, (event?.labels ?? []).map((label) => label.id))) {
        workspace.clear(draftPrefix);
        notifyContentChanged(id);
        exitAllowed.current = true;
        exitEdit();
        setIsSubmitting(false);
        return;
      }
      if (event?.recurrenceRuleId != null) {
        setIsSubmitting(false);
        setSeriesError(null);
        setPendingSeriesAction({
          data,
          kind: 'save',
          mode: seriesScopeModeFor(event.recurrence, data.recurrence),
        });
        return;
      }
      try {
        const token = await sessionTransport.getAccessToken();
        if (token === null) {
          setError('auth:errors.sessionExpired');
          return;
        }
        await sessionApiClient.updateEvent(token, id!, eventId!, { ...data, ...conflict.precondition, labelIds: selectedLabelIds });
        workspace.clear(draftPrefix);
        notifyContentChanged(id);
        exitAllowed.current = true;
        exitEdit();
      } catch (err: unknown) {
        // Repeat-rule field errors belong to the form, next to the repeat settings.
        if (hasRecurrenceFieldErrors(err)) throw err;
        if (!conflict.handle(err)) setError('tasks:saveRetry');
      } finally {
        setIsSubmitting(false);
      }
    },
    [event, id, eventId, router, selectedLabelIds, workspace, draftPrefix, conflict, exitEdit],
  );

  const handleSeriesSelect = useCallback(async (scope: SeriesScope) => {
    if (pendingSeriesAction === null || id === undefined || eventId === undefined) return;
    setSeriesSubmitting(scope);
    setSeriesError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setSeriesError('auth:errors.sessionExpired');
        return;
      }

      if (scope === 'this_only') {
        await sessionApiClient.updateEvent(token, id, eventId, { ...pendingSeriesAction.data, ...conflict.precondition, labelIds: selectedLabelIds });
      } else {
        await sessionApiClient.updateEventSeries(
          token,
          id,
          eventId,
          { ...eventSeriesUpdate(pendingSeriesAction.data, selectedLabelIds), ...conflict.seriesPrecondition },
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
        router.dismissTo(`/households/${encodeURIComponent(id)}/events`);
      }
    } catch (caught: unknown) {
      if (conflict.handle(caught)) {
        setPendingSeriesAction(null);
        setSeriesError(null);
        return;
      }
      setSeriesError(
        caught instanceof ApiClientError && caught.status === 404
          ? 'tasks:seriesMissing'
          : 'tasks:seriesFailure',
      );
      await fetchEvent(false);
    } finally {
      setSeriesSubmitting(null);
    }
  }, [eventId, fetchEvent, id, pendingSeriesAction, router, selectedLabelIds, workspace, draftPrefix, conflict, exitEdit]);

  const handleCancel = () => {
    if (pendingSeriesAction) { setPendingSeriesAction(null); setSeriesError(null); }
    else exitEdit();
  };

  return (
    <EventWindow draftPrefix={draftPrefix} size={pendingSeriesAction ? 'standard' : 'editor'} title={pendingSeriesAction ? seriesScopeTitle(pendingSeriesAction.mode) : t('edit')} busy={isSubmitting || seriesSubmitting !== null} onClose={handleCancel} onBackStep={pendingSeriesAction ? handleCancel : undefined} exitAllowed={exitAllowed}>
      {pendingSeriesAction ? <SeriesScopeContent mode={pendingSeriesAction.mode} error={seriesError === null ? null : t(seriesError)} submitting={seriesSubmitting} onClose={handleCancel} onSelect={scope => void handleSeriesSelect(scope)} />
        : loading ? <LoadingState label={t('loading')} /> : event === null ? <Stack gap={3}>
          <LoadError message={t(error ?? 'notFound')} onRetry={() => void fetchEvent()} />
        </Stack> : <Stack gap={4}>
          <HouseholdContextNote householdName={householdName} />
          {error ? <Banner>{t(error)}</Banner> : null}
          {conflict.panel}
          <EventForm draftKey={draftPrefix + 'form'} initial={event} onSubmit={handleSubmit} onCancel={handleCancel} submitLabel={t('common:save')} isSubmitting={isSubmitting} householdId={id} selectedLabelIds={selectedLabelIds} onLabelChange={setSelectedLabelIds} />
        </Stack>}
    </EventWindow>
  );
}
