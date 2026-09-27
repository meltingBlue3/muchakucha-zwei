import { CardActionsMenu } from '../../ui/card-actions-menu';
import { markdownExcerpt } from './markdown';
import { formatDate } from '../../ui/date-values';
import { ContentCard } from '../../ui/content-card';
import type { NoteResponseDto } from '@muchakucha/api-client';
import { Stack, Text } from '../../ui/primitives';

interface NoteCardProps {
  onDelete?: (() => void) | undefined;
  note: NoteResponseDto;
  onPress: (note: NoteResponseDto) => void;
}

export function NoteCard({ note, onPress, onDelete }: NoteCardProps) {

  const dateLabel = formatDate(new Date(note.updatedAt));

  const bodyPreview = markdownExcerpt(note.body ?? '');
  const previewText = bodyPreview.length > 120 ? bodyPreview.slice(0, 120) + '…' : bodyPreview;

  return (
    <ContentCard
      accessibilityLabel={`笔记：${note.title}`}
      onPress={() => onPress(note)}
      trailing={onDelete ? <CardActionsMenu label={`删除笔记：${note.title}`} onPress={onDelete} /> : null}
    >
      <Stack gap={1}>
        <Text variant="body" style={{ fontWeight: '600' }} numberOfLines={2}>
          {note.title}
        </Text>
        {previewText !== '' && (
          <Text variant="bodySm" numberOfLines={2} color="inkMuted">
            {previewText}
          </Text>
        )}
        <Text variant="caption" color="inkMuted">更新于 {dateLabel}</Text>
      </Stack>
    </ContentCard>
  );
}
