import { View } from 'react-native';
import { CardActionsMenu } from '../../ui/card-actions-menu';
import { markdownExcerpt } from './markdown';
import { formatDate } from '../../ui/date-values';
import { ListRow } from '../../ui/list-group';
import type { NoteResponseDto } from '@muchakucha/api-client';
import { Text } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import { useDesktop } from '../../ui/use-desktop';

interface NoteCardProps {
  onEdit?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
  note: NoteResponseDto;
  onPress: (note: NoteResponseDto) => void;
  /** The note open beside the list on a wide screen. */
  selected?: boolean;
}

/** One note as a list row: title, then when it changed and how it begins. */
export function NoteCard({ note, onPress, onEdit, onDelete, selected = false }: NoteCardProps) {
  const excerpt = markdownExcerpt(note.body ?? '');
  const desktop = useDesktop();

  return (
    <ListRow
      accessibilityLabel={`笔记：${note.title}`}
      onPress={() => onPress(note)}
      selected={selected}
      trailing={<CardActionsMenu subject={`笔记：${note.title}`} actions={[
        ...(onEdit ? [{ kind: 'edit' as const, accessibilityLabel: `编辑笔记：${note.title}`, onPress: onEdit }] : []),
        ...(onDelete ? [{ kind: 'delete' as const, accessibilityLabel: `删除笔记：${note.title}`, onPress: onDelete }] : []),
      ]} />}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}><Text variant={desktop ? 'bodySm' : 'body'} color="ink" numberOfLines={1} style={{ flex: 1 }}>{note.title}</Text>{desktop ? <Text variant="time">{formatDate(new Date(note.updatedAt))}</Text> : null}</View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing[2], marginTop: theme.spacing[1] / 2 }}>
        {!desktop ? <Text variant="time" color="inkFaint">{formatDate(new Date(note.updatedAt))}</Text> : null}
        {excerpt !== '' ? <Text variant="meta" numberOfLines={desktop ? 2 : 1} style={{ flex: 1 }}>{excerpt}</Text> : null}
      </View>
    </ListRow>
  );
}
