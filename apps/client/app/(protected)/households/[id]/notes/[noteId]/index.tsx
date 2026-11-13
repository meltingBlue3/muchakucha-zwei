import { useTranslation } from '../../../../../../src/i18n';
import { MarkdownBody } from '../../../../../../src/features/notes/markdown-body';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import type { NoteResponseDto } from '@muchakucha/api-client';

import { sessionApiClient, sessionTransport } from '../../../../../../src/features/auth/session-runtime';
import { NoteWindow } from '../../../../../../src/features/notes/note-window';
import { useDesktop } from '../../../../../../src/ui/use-desktop';
import { theme } from '../../../../../../src/ui/theme';
import { formatDateTime } from '../../../../../../src/ui/date-values';
import { rememberRouteTrigger } from '../../../../../../src/platform/overlays/route-trigger';
import { Heading, LoadError, LoadingState, Stack, Text } from '../../../../../../src/ui/primitives';
import { DetailEditButton } from '../../../../../../src/ui/detail-fields';

export default function NoteDetailRoute() {
  const { t } = useTranslation(['notes', 'auth']);
  const desktop = useDesktop();
  const { id, noteId } = useLocalSearchParams<{ id: string; noteId: string }>();
  const router = useRouter();
  const [note, setNote] = useState<NoteResponseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'auth:errors.sessionExpired' | 'loadError' | null>(null);

  const fetchNote = useCallback(async () => {
    if (id === undefined || noteId === undefined) return;
    setError(null);
    try {
      const token = await sessionTransport.getAccessToken();
      if (token === null) {
        setError('auth:errors.sessionExpired');
        return;
      }
      const result = await sessionApiClient.getNote(token, id, noteId);
      setNote(result);
    } catch {
      setError('loadError');
    } finally {
      setLoading(false);
    }
  }, [id, noteId]);

  // Refetch whenever this screen regains focus (e.g. returning from the
  // edit screen), not just on first mount — otherwise a save doesn't show
  // up here until the whole route remounts.
  useFocusEffect(
    useCallback(() => {
      void fetchNote();
    }, [fetchNote]),
  );

  const handleEdit = useCallback(() => {
    rememberRouteTrigger();
    void router.push(`/households/${encodeURIComponent(id)}/notes/${encodeURIComponent(noteId)}/edit`);
  }, [router, id, noteId]);

  if (loading || note === null || error !== null) {
    return <NoteWindow title={t('detail')}><Stack gap={3}>
      {loading ? <LoadingState label={t('loading')} /> : <>
        <LoadError message={t(error ?? 'notFound')} onRetry={() => void fetchNote()} />
      </>}
    </Stack></NoteWindow>;
  }

  const body = note.body ?? '';
  const updated = formatDateTime(new Date(note.updatedAt));

  return (
    <NoteWindow title={t('detail')} headerNote={t('updated', { date: updated })} headerActions={<DetailEditButton accessibilityLabel={t('edit')} worded onPress={handleEdit} />}>
      <Stack gap={4}>
        <Heading level={2} style={desktop ? theme.typography.readingTitle : undefined}>{note.title}</Heading>
        {!desktop ? <Text variant="caption" color="inkMuted">{t('lastUpdated', { date: updated })}</Text> : null}
        <MarkdownBody source={body} />
      </Stack>
    </NoteWindow>
  );
}
