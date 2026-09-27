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
import {
  SeriesScopeContent,
  seriesScopeTitle,
  type SeriesScope,
  type SeriesScopeMode,
} from '../../../../../../src/features/recurrence/series-scope-sheet';
import { Banner, LoadError, LoadingState, Stack } from '../../../../../../src/ui/primitives';

type PendingSeriesAction =
  { kind: 'save'; data: CreateEventDto; mode: SeriesScopeMode };

const SERIES_FAILURE = '没有完成。这个重复安排没有发生任何改变，请重试。';
const SERIES_MISSING = '这一次重复已经被其他人删除了。返回后可以看到最新的安排。';

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
  const { id, eventId } = useLocalSearchParams<{ id: string; eventId: string }>();
  const workspace = useWorkspaceStore();
  const draftPrefix = `draft:${id}:events:${eventId}:`;
  const router = useRouter();
  const exitAllowed = useRef(false);
  const [event, setEvent] = useState<EventResponseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLabelIds, setSelectedLabelIds] = useWorkspaceState<string[]>(draftPrefix + 'labels', []);
  const [pendingSeriesAction, setPendingSeriesAction] = useState<PendingSeriesAction | null>(null);
  const [seriesSubmitting, setSeriesSubmitting] = useState<SeriesScope | null>(null);
  const [seriesError, setSeriesError] = useState<string | null>(null);


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
        setError('登录已过期，请重新登录。');
        return;
      }
      const result = await sessionApiClient.getEvent(token, id, eventId);
      captureEditBaseline(workspace, draftPrefix, result);
      setEvent(result);
      workspace.seed(draftPrefix + 'labels', (result.labels ?? []).map((l) => l.id));
    } catch {
      if (showLoading) setError('无法加载日程，请重试或确认它是否已被删除。');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [id, eventId, workspace, draftPrefix]);

  useEffect(() => {
    void fetchEvent();
  }, [fetchEvent]);

  const handleSubmit = useCallback(
    async (data: CreateEventDto) => {
      if (event?.recurrenceRuleId != null) {
        setSeriesError(null);
        setPendingSeriesAction({
          data,
          kind: 'save',
          mode: seriesScopeModeFor(event.recurrence, data.recurrence),
        });
        return;
      }
      setIsSubmitting(true);
      setError(null);
      try {
        const token = await sessionTransport.getAccessToken();
        if (token === null) {
          setError('登录已过期，请重新登录。');
          return;
        }
        await sessionApiClient.updateEvent(token, id!, eventId!, { ...data, ...conflict.precondition, labelIds: selectedLabelIds });
        workspace.clear(draftPrefix);
        exitAllowed.current = true;
        router.dismissTo(`/households/${encodeURIComponent(id!)}/events/${encodeURIComponent(eventId!)}`);
      } catch (err: unknown) {
        if (!conflict.handle(err)) setError('保存失败，请重试。');
      } finally {
        setIsSubmitting(false);
      }
    },
    [event, id, eventId, router, selectedLabelIds, workspace, draftPrefix, conflict],
  );

  const handleSeriesSelect = useCallback(async (scope: SeriesScope) => {
    if (pendingSeriesAction === null || id === undefined || eventId === undefined) return;
    setSeriesSubmitting(scope);
    setSeriesError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setSeriesError('登录已过期，请重新登录。');
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
      if (scope === 'this_only') {
        exitAllowed.current = true;
        router.dismissTo(`/households/${encodeURIComponent(id)}/events/${encodeURIComponent(eventId)}`);
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
          ? SERIES_MISSING
          : SERIES_FAILURE,
      );
      await fetchEvent(false);
    } finally {
      setSeriesSubmitting(null);
    }
  }, [eventId, fetchEvent, id, pendingSeriesAction, router, selectedLabelIds, workspace, draftPrefix, conflict]);

  const handleCancel = () => {
    if (pendingSeriesAction) { setPendingSeriesAction(null); setSeriesError(null); }
    else router.dismissTo(`/households/${encodeURIComponent(id)}/events/${encodeURIComponent(eventId)}`);
  };

  return (
    <EventWindow title={pendingSeriesAction ? seriesScopeTitle(pendingSeriesAction.mode) : '编辑日程'} busy={isSubmitting || seriesSubmitting !== null} onClose={handleCancel} onBackStep={pendingSeriesAction ? handleCancel : undefined} exitAllowed={exitAllowed}>
      {pendingSeriesAction ? <SeriesScopeContent mode={pendingSeriesAction.mode} error={seriesError} submitting={seriesSubmitting} onClose={handleCancel} onSelect={scope => void handleSeriesSelect(scope)} />
        : loading ? <LoadingState label="正在加载日程" /> : event === null ? <Stack gap={3}>
          <LoadError message={error ?? '日程未找到或已被删除。'} onRetry={() => void fetchEvent()} />
        </Stack> : <Stack gap={4}>
          {error ? <Banner>{error}</Banner> : null}
          {conflict.panel}
          <EventForm draftKey={draftPrefix + 'form'} initial={event} onSubmit={handleSubmit} onCancel={handleCancel} submitLabel="保存" isSubmitting={isSubmitting} householdId={id} selectedLabelIds={selectedLabelIds} onLabelChange={setSelectedLabelIds} />
        </Stack>}
    </EventWindow>
  );
}
