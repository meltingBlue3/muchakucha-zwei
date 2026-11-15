import { useTranslation } from '../../i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { sessionApiClient, sessionTransport } from '../auth/session-runtime';
import { TaskWindow } from '../tasks/task-window';
import { EventWindow } from '../events/event-window';
import { NoteWindow } from '../notes/note-window';
import { useRouteWindowClose } from '../../ui/route-window';
import { LoadError, LoadingState, Stack, Text } from '../../ui/primitives';
import { DeleteContentQuestion, readDeletableContent, useContentDeletion } from './content-deletion';
import { canDeleteContent, type DeletableResource } from './use-content-delete';

const windows = { tasks: TaskWindow, events: EventWindow, notes: NoteWindow };

/** The 删除 window opened from a list's 「⋯」 menu: reads the content, then asks. */
export function DeleteContentScreen({ resource }: { resource: DeletableResource }) {
  const { t } = useTranslation(['deleteContent', 'auth']);
  const { id, taskId, eventId, noteId } = useLocalSearchParams<{ id: string; taskId?: string; eventId?: string; noteId?: string }>();
  const contentId = resource === 'tasks' ? taskId : resource === 'events' ? eventId : noteId;
  const { close } = useRouteWindowClose(resource);
  const exitAllowed = useRef(false);
  const deletion = useContentDeletion(resource, id, contentId, () => { exitAllowed.current = true; close(); });
  const { open } = deletion;
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<'auth:errors.sessionExpired' | 'loadFailed' | null>(null);
  const Window = windows[resource];
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      if (!id || !contentId) throw new Error('Missing resource');
      const token = await sessionTransport.getAccessToken();
      if (token === null) { setLoadError('auth:errors.sessionExpired'); return; }
      const [content, household] = await Promise.all([
        readDeletableContent(resource, token, id, contentId),
        sessionApiClient.getHousehold(token, id),
      ]);
      const actor = household.members.find(member => member.isCurrentUser);
      setAllowed(canDeleteContent(actor?.role, actor?.userId, content.createdBy));
      open(content);
    } catch {
      setLoadError('loadFailed');
    } finally { setLoading(false); }
  }, [id, contentId, resource, open]);
  useEffect(() => { void load(); }, [load]);

  const loadErrorText = loadError === 'loadFailed' ? t(`loadFailed.${resource}`) : loadError === null ? null : t(loadError);
  return <Window size="standard" title={t(`title.${resource}`)} busy={deletion.submitting !== null} onClose={close} exitAllowed={exitAllowed}>
    {loading ? <LoadingState label={t(`loading.${resource}`)} /> : deletion.target === null ? <LoadError message={loadErrorText ?? t(`missing.${resource}`)} onRetry={() => void load()} /> : !allowed ? <Text accessibilityRole="alert">{t(`denied.${resource}`)}</Text> : <Stack gap={4}>
      <DeleteContentQuestion resource={resource} deletion={deletion} onCancel={close} />
    </Stack>}
  </Window>;
}
