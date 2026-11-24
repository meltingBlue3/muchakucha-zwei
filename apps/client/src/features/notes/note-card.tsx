import { useMemo } from 'react';
import { View } from 'react-native';
import Pin from 'lucide-react-native/icons/pin';
import PinOff from 'lucide-react-native/icons/pin-off';
import type { NoteResponseDto } from '@muchakucha/api-client';
import { useTranslation } from '../../i18n';
import { CardActionsMenu, type CardAction } from '../../ui/card-actions-menu';
import { formatDate } from '../../ui/date-values';
import { ListRow } from '../../ui/list-group';
import { Text } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import { useDesktop } from '../../ui/use-desktop';
import { LabelTags } from '../labels/label-chip';
import { labelName } from '../labels/label-name';
import { checklistProgress, markdownExcerpt } from './markdown';
import type { NoteSnippet } from './note-search';

/** Between the parts of a row's second line, as in the note's own byline. */
const SEPARATOR = ' · ';

interface NoteCardProps {
  note: NoteResponseDto;
  /** Where a search matched the body; replaces the row's second line. */
  snippet?: NoteSnippet | null;
  /** The author's name; null while the household's members are not known. */
  author: string | null;
  onPress: (note: NoteResponseDto) => void;
  onTogglePin?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
  /** The note open beside the list on a wide screen. */
  selected?: boolean;
}

/**
 * One note as a list row. The title, with its first label beside it; then
 * when it changed, how far its checklist is ticked, who wrote it and, without
 * a checklist, how it begins. A search that matched the body shows where.
 */
export function NoteCard({ note, snippet = null, author, onPress, onTogglePin, onDelete, selected = false }: NoteCardProps) {
  const { t } = useTranslation(['notes', 'common']);
  const desktop = useDesktop();
  const body = note.body ?? '';
  const progress = useMemo(() => checklistProgress(body), [body]);
  // A checklist's progress already says what it is.
  const excerpt = useMemo(() => progress === null ? markdownExcerpt(body) : '', [body, progress]);
  const pinned = note.pinnedAt !== null;
  const subject = t('card', { title: note.title });
  const details = [
    ...(pinned ? [t('pinnedState')] : []),
    ...(progress ? [t('progress', { done: progress.done, total: progress.total })] : []),
    ...(note.labels.length > 0 ? [note.labels.map(labelName).join('、')] : []),
  ];
  const accessibilityLabel = details.reduce((name, value) => t('common:nameValue', { name, value }), subject);
  const actions: CardAction[] = [
    ...(onTogglePin ? [{ label: t(pinned ? 'unpin' : 'pin'), icon: pinned ? PinOff : Pin, accessibilityLabel: t(pinned ? 'unpinCard' : 'pinCard', { title: note.title }), onPress: onTogglePin }] : []),
    ...(onDelete ? [{ kind: 'delete' as const, accessibilityLabel: t('deleteCard', { title: note.title }), onPress: onDelete }] : []),
  ];

  return (
    <ListRow
      accessibilityLabel={accessibilityLabel}
      onPress={() => onPress(note)}
      selected={selected}
      // Opening a note is editing it, so the menu only pins and deletes.
      trailing={<CardActionsMenu subject={subject} actions={actions} />}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}>
        <Text variant={desktop ? 'bodySm' : 'body'} color="ink" numberOfLines={1} style={{ flexShrink: 1 }}>{note.title}</Text>
        {note.labels.length > 0 ? <View style={{ flexShrink: 0, maxWidth: '45%' }}><LabelTags labels={note.labels} /></View> : null}
      </View>
      <View style={{ marginTop: theme.spacing[1] / 2 }}>
        {snippet ? (
          <Text variant="meta" color="inkMuted" testID="note-snippet">
            {snippet.before}
            <Text variant="meta" color="ink" style={{ fontWeight: theme.typography.label.fontWeight }}>{snippet.match}</Text>
            {snippet.after}
          </Text>
        ) : (
          <Text variant="meta" color="inkMuted" numberOfLines={desktop ? 2 : 1}>
            <Text variant="time" color="inkFaint">{formatDate(new Date(note.updatedAt))}</Text>
            {progress ? <>{SEPARATOR}<Text variant="time" color="inkMuted">{`${progress.done}/${progress.total}`}</Text></> : null}
            {author ? `${SEPARATOR}${author}` : null}
            {excerpt ? `${SEPARATOR}${excerpt}` : null}
          </Text>
        )}
      </View>
    </ListRow>
  );
}
