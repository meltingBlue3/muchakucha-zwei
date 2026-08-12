import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import { ApiClientError } from '@muchakucha/api-client';
import type { CreateEventDto, EventResponseDto, UpdateSeriesDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { EventForm } from '../../../../../../src/features/events/event-form';
import { seriesScopeModeFor } from '../../../../../../src/features/recurrence/series-scope-mode';
import {
  SeriesScopeSheet,
  type SeriesScope,
  type SeriesScopeMode,
} from '../../../../../../src/features/recurrence/series-scope-sheet';
import { AppShell } from '../../../../../../src/ui/household-components';
import { Stack, Text } from '../../../../../../src/ui/primitives';
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
function eventSeriesUpdate(data: CreateEventDto): UpdateSeriesDto {
  return {
    title: data.title,
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
  const router = useRouter();
  const activeTheme = useTheme<Theme>();
  const [event, setEvent] = useState<EventResponseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [pendingSeriesAction, setPendingSeriesAction] = useState<PendingSeriesAction | null>(null);
  const [seriesSubmitting, setSeriesSubmitting] = useState<SeriesScope | null>(null);
  const [seriesError, setSeriesError] = useState<string | null>(null);

  const fetchEvent = useCallback(async (showLoading = true) => {
    if (id === undefined || eventId === undefined) return;
    if (showLoading) setLoading(true);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setError('登录已过期。');
        return;
      }
      const result = await sessionApiClient.getEvent(token, id, eventId);
      setEvent(result);
      setSelectedLabelIds((result.labels ?? []).map((l) => l.id));
    } catch {
      if (showLoading) setError('无法加载事件。');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [id, eventId]);

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
        await sessionApiClient.updateEvent(token, id!, eventId!, data);
        // Sync labels: tag with all selected labels (replaces current)
        await sessionApiClient.tagEvent(token, id!, eventId!, { labelIds: selectedLabelIds });
        router.back();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : '保存失败，请重试。';
        setError(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [event, id, eventId, router, selectedLabelIds],
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
      router.dismissTo(`/households/${encodeURIComponent(id!)}/events`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '删除失败，请重试。';
      setError(message);
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
        router.dismissTo(`/households/${encodeURIComponent(id)}/events`);
        return;
      }

      if (scope === 'this_only') {
        await sessionApiClient.updateEvent(token, id, eventId, pendingSeriesAction.data);
        await sessionApiClient.tagEvent(token, id, eventId, { labelIds: selectedLabelIds });
      } else {
        await sessionApiClient.updateEventSeries(
          token,
          id,
          eventId,
          eventSeriesUpdate(pendingSeriesAction.data),
        );
      }
      setPendingSeriesAction(null);
      router.back();
    } catch (caught: unknown) {
      setSeriesError(
        caught instanceof ApiClientError && caught.status === 404
          ? SERIES_MISSING
          : SERIES_FAILURE,
      );
      await fetchEvent(false);
    } finally {
      setSeriesSubmitting(null);
    }
  }, [eventId, fetchEvent, id, pendingSeriesAction, router, selectedLabelIds]);

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  if (loading) {
    return (
      <AppShell accessibilityLabel="加载事件中" title="编辑事件" showBack showProfile>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: activeTheme.spacing[12] }}>
          <ActivityIndicator color={activeTheme.colors.coral} />
        </View>
      </AppShell>
    );
  }

  if (event === null || error !== null) {
    return (
      <AppShell accessibilityLabel="事件加载失败" title="编辑事件" showBack showProfile>
        <Stack gap={4}>
          <Text variant="heading">事件</Text>
          <Text>{error ?? '事件未找到。'}</Text>
          <Pressable onPress={() => router.back()} hitSlop={activeTheme.spacing[4]}>
            <Text variant="label" color="coral">
              返回日历
            </Text>
          </Pressable>
        </Stack>
      </AppShell>
    );
  }

  return (
    <AppShell accessibilityLabel="编辑事件" title="编辑事件" showBack showProfile>
        <Stack gap={4}>
          <Text variant="heading">编辑事件</Text>
          {error !== null && (
            <Text variant="bodySm" color="destructive">
              {error}
            </Text>
          )}
          <EventForm
            initial={event}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            submitLabel="保存"
            isSubmitting={isSubmitting}
            householdId={id}
            selectedLabelIds={selectedLabelIds}
            onLabelChange={setSelectedLabelIds}
          />

          {/* Delete section */}
          <View style={{ marginTop: activeTheme.spacing[4], borderTopWidth: 1, borderTopColor: activeTheme.colors.border, paddingTop: activeTheme.spacing[4] }}>
            {!confirmDelete ? (
              <Pressable
                onPress={openDelete}
                hitSlop={activeTheme.spacing[1]}
                style={({ pressed }) => ({
                  alignItems: 'center',
                  paddingVertical: activeTheme.spacing[3],
                  borderRadius: activeTheme.borderRadii.sm,
                  borderWidth: 1,
                  borderColor: activeTheme.colors.destructive,
                  opacity: pressed ? 0.7 : 1,
                })}
                accessibilityLabel="删除事件"
              >
                <Text variant="button" color="destructive">
                  删除事件
                </Text>
              </Pressable>
            ) : (
              <Stack gap={3}>
                <Text variant="bodySm" color="destructive">
                  确定要删除这个事件吗？此操作不可撤销。
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
                    accessibilityLabel="确认删除事件"
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
    </AppShell>
  );
}
