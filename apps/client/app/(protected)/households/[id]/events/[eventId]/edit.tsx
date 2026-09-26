import { EventWindow } from '../../../../../../src/features/events/event-window';
import { useEditConflict, captureEditBaseline } from '../../../../../../src/ui/edit-conflict';
import { useWorkspaceStore, useWorkspaceState } from '../../../../../../src/ui/workspace-state';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable } from 'react-native';
import { useTheme } from '@shopify/restyle';
import { ApiClientError } from '@muchakucha/api-client';
import type { CreateEventDto, EventResponseDto, GetHouseholdMemberDto, UpdateSeriesDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { EventForm } from '../../../../../../src/features/events/event-form';
import { seriesScopeModeFor } from '../../../../../../src/features/recurrence/series-scope-mode';
import {
  SeriesScopeContent,
  seriesScopeTitle,
  type SeriesScope,
  type SeriesScopeMode,
} from '../../../../../../src/features/recurrence/series-scope-sheet';
import { Button, Spinner, Stack, Text } from '../../../../../../src/ui/primitives';
import type { Theme } from '../../../../../../src/ui/theme';

type PendingSeriesAction =
  | { kind: 'save'; data: CreateEventDto; mode: SeriesScopeMode }
  | { kind: 'delete'; mode: 'delete' };

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
  const [members, setMembers] = useState<GetHouseholdMemberDto[]>([]);
  const activeTheme = useTheme<Theme>();
  const [event, setEvent] = useState<EventResponseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedLabelIds, setSelectedLabelIds] = useWorkspaceState<string[]>(draftPrefix + 'labels', []);
  const [pendingSeriesAction, setPendingSeriesAction] = useState<PendingSeriesAction | null>(null);
  const [seriesSubmitting, setSeriesSubmitting] = useState<SeriesScope | null>(null);
  const [seriesError, setSeriesError] = useState<string | null>(null);

  const actor = members.find(member => member.isCurrentUser);
  const canDelete = actor !== undefined && (actor.role === 'OWNER' || actor.role === 'ADMIN' || actor.userId === event?.createdBy);

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
        setError('登录已过期。');
        return;
      }
      const [result, household] = await Promise.all([sessionApiClient.getEvent(token, id, eventId), sessionApiClient.getHousehold(token, id)]);
      setMembers(household.members);
      captureEditBaseline(workspace, draftPrefix, result);
      setEvent(result);
      workspace.seed(draftPrefix + 'labels', (result.labels ?? []).map((l) => l.id));
    } catch {
      if (showLoading) setError('无法加载事件。');
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
          setError('登录已过期。');
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

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setError('登录已过期。');
        return;
      }
      await sessionApiClient.deleteEvent(token, id!, eventId!);
      // Go straight back to the calendar list, not router.back() — a single
      // pop would land on the now-deleted event's detail screen.
      exitAllowed.current = true;
      router.dismissTo(`/households/${encodeURIComponent(id!)}/events`);
    } catch (err: unknown) {
      setError('删除失败，请检查网络或权限后重试。');
    } finally {
      setDeleting(false);
    }
  }, [id, eventId, router]);

  const openDelete = useCallback(() => {
    if (event?.recurrenceRuleId != null) {
      setSeriesError(null);
      setPendingSeriesAction({ kind: 'delete', mode: 'delete' });
      return;
    }
    setConfirmDelete(true);
  }, [event]);

  const handleSeriesSelect = useCallback(async (scope: SeriesScope) => {
    if (pendingSeriesAction === null || id === undefined || eventId === undefined) return;
    setSeriesSubmitting(scope);
    setSeriesError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setSeriesError('登录已过期。');
        return;
      }

      if (pendingSeriesAction.kind === 'delete') {
        await sessionApiClient.deleteEventSeries(token, id, eventId, scope);
        setPendingSeriesAction(null);
        exitAllowed.current = true;
        router.dismissTo(`/households/${encodeURIComponent(id)}/events`);
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
    else if (confirmDelete) setConfirmDelete(false);
    else router.dismissTo(`/households/${encodeURIComponent(id)}/events/${encodeURIComponent(eventId)}`);
  };

  return (
    <EventWindow title={pendingSeriesAction ? seriesScopeTitle(pendingSeriesAction.mode) : confirmDelete ? '删除日程' : '编辑日程'} busy={isSubmitting || deleting || seriesSubmitting !== null} onClose={handleCancel} onBackStep={pendingSeriesAction || confirmDelete ? handleCancel : undefined} exitAllowed={exitAllowed}>
      {pendingSeriesAction ? <SeriesScopeContent mode={pendingSeriesAction.mode} error={seriesError} submitting={seriesSubmitting} onClose={handleCancel} onSelect={scope => void handleSeriesSelect(scope)} />
        : confirmDelete ? <Stack gap={3}>
          <Text>确定要删除这个日程吗？此操作不可撤销。</Text>
          {error ? <Text accessibilityRole="alert" color="destructive">{error}</Text> : null}
          <Button label="取消删除" tone="secondary" disabled={deleting} onPress={handleCancel} />
          <Button label="确认删除日程" accessibilityLabel="确认删除事件" loading={deleting} onPress={() => void handleDelete()} />
        </Stack> : loading ? <Spinner label="正在加载日程" /> : event === null ? <Stack gap={3}>
          <Text accessibilityRole="alert">{error ?? '日程未找到或已被删除。'}</Text>
          <Button label="重试" tone="secondary" onPress={() => void fetchEvent()} />
        </Stack> : <Stack gap={4}>
          {error ? <Text variant="bodySm" color="destructive" accessibilityRole="alert">{error}</Text> : null}
          {conflict.panel}
          <EventForm draftKey={draftPrefix + 'form'} initial={event} onSubmit={handleSubmit} onCancel={handleCancel} submitLabel="保存" isSubmitting={isSubmitting} householdId={id} selectedLabelIds={selectedLabelIds} onLabelChange={setSelectedLabelIds} />
          {canDelete ? <Pressable accessibilityRole="button" accessibilityLabel="删除事件" disabled={isSubmitting} onPress={openDelete} style={{ minHeight: activeTheme.controlSizes.touchTarget, justifyContent: 'center', alignSelf: 'flex-start' }}><Text variant="label" color="destructive">删除日程</Text></Pressable> : null}
        </Stack>}
    </EventWindow>
  );
}
