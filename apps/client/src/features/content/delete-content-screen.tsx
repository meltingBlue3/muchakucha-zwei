import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ApiClientError } from '@muchakucha/api-client';
import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { TaskWindow } from '../tasks/task-window';
import { EventWindow } from '../events/event-window';
import { NoteWindow } from '../notes/note-window';
import { SeriesScopeContent, type SeriesScope } from '../recurrence/series-scope-sheet';
import { useRouteWindowClose } from '../../ui/route-window';
import { Banner, ConfirmActions, LoadError, LoadingState, Stack, Text } from '../../ui/primitives';
import { useWorkspaceStore } from '../../ui/workspace-state';
import { canDeleteContent, type DeletableResource } from './use-content-delete';

const names = { tasks: '任务', events: '日程', notes: '笔记' };
const windows = { tasks: TaskWindow, events: EventWindow, notes: NoteWindow };
interface DeleteTarget { title: string; recurring: boolean; allowed: boolean }

export function DeleteContentScreen({ resource }: { resource: DeletableResource }) {
  const { id, taskId, eventId, noteId } = useLocalSearchParams<{ id: string; taskId?: string; eventId?: string; noteId?: string }>();
  const contentId = resource === 'tasks' ? taskId : resource === 'events' ? eventId : noteId;
  const { close } = useRouteWindowClose(resource);
  const workspace = useWorkspaceStore();
  const exitAllowed = useRef(false);
  const [target, setTarget] = useState<DeleteTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<SeriesScope | 'single' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = names[resource];
  const Window = windows[resource];
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setTarget(null);
    try {
      if (!id || !contentId) throw new Error('Missing resource');
      const token = await sessionTransport.getAccessToken();
      if (token === null) { setError('登录已过期，请重新登录。'); return; }
      const [content, household] = await Promise.all([
        resource === 'tasks' ? sessionApiClient.getTask(token, id, contentId)
          : resource === 'events' ? sessionApiClient.getEvent(token, id, contentId)
            : sessionApiClient.getNote(token, id, contentId),
        sessionApiClient.getHousehold(token, id),
      ]);
      const actor = household.members.find(member => member.isCurrentUser);
      setTarget({ title: content.title, recurring: 'recurrenceRuleId' in content && content.recurrenceRuleId != null, allowed: canDeleteContent(actor?.role, actor?.userId, content.createdBy) });
    } catch {
      setError(`无法加载${name}，请重试或确认它是否已被删除。`);
    } finally { setLoading(false); }
  }, [id, contentId, resource, name]);
  useEffect(() => { void load(); }, [load]);

  const remove = async (scope?: SeriesScope) => {
    if (!id || !contentId || !target?.allowed || submitting !== null) return;
    setSubmitting(scope ?? 'single');
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) { setError('登录已过期，请重新登录。'); return; }
      if (resource === 'tasks') {
        if (scope) await sessionApiClient.deleteTaskSeries(token, id, contentId, scope);
        else await sessionApiClient.deleteTask(token, id, contentId);
      } else if (resource === 'events') {
        if (scope) await sessionApiClient.deleteEventSeries(token, id, contentId, scope);
        else await sessionApiClient.deleteEvent(token, id, contentId);
      } else await sessionApiClient.deleteNote(token, id, contentId);
      workspace.clear(`draft:${id}:${resource}:${contentId}:`);
      exitAllowed.current = true;
      close();
    } catch (caught: unknown) {
      setError(caught instanceof ApiClientError && caught.status === 403
        ? '你已没有删除权限，请关闭窗口后刷新。'
        : caught instanceof ApiClientError && caught.status === 404
          ? '内容已不存在，请关闭窗口后刷新。'
          : '删除失败，请检查网络后重试。');
    } finally { setSubmitting(null); }
  };

  return <Window title={`删除${name}`} busy={submitting !== null} onClose={close} exitAllowed={exitAllowed}>
    {loading ? <LoadingState label={`正在加载${name}`} /> : target === null ? <LoadError message={error ?? `无法加载${name}。`} onRetry={() => void load()} /> : !target.allowed ? <Text accessibilityRole="alert">你没有删除这条{name}的权限。</Text> : <Stack gap={3}>
      <Text variant="section">{target.title}</Text>
      {target.recurring ? <SeriesScopeContent mode="delete" confirmLabel={`确认删除${name}`} error={error} submitting={submitting === 'single' ? null : submitting} onClose={close} onSelect={scope => void remove(scope)} /> : <>
        <Text>确定要删除这条{name}吗？此操作不可撤销。</Text>
        {error ? <Banner>{error}</Banner> : null}
        <ConfirmActions cancelLabel="取消删除" confirmLabel={`确认删除${name}`} destructive busy={submitting !== null} onCancel={close} onConfirm={() => void remove()} />
      </>}
    </Stack>}
  </Window>;
}
