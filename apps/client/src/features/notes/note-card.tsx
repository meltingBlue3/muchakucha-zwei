import { CardActionsMenu } from '../../ui/card-actions-menu';
import { markdownExcerpt } from './markdown';
import { Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { NoteResponseDto } from '@muchakucha/api-client';
import type { Theme } from '../../ui/theme';
import { Stack, Text } from '../../ui/primitives';

interface NoteCardProps {
  onDelete?: (() => void) | undefined;
  note: NoteResponseDto;
  onPress: (note: NoteResponseDto) => void;
}

export function NoteCard({ note, onPress, onDelete }: NoteCardProps) {
  const activeTheme = useTheme<Theme>();

  const updatedDate = new Date(note.updatedAt);
  const dateLabel = `${updatedDate.getFullYear()}-${String(updatedDate.getMonth() + 1).padStart(2, '0')}-${String(updatedDate.getDate()).padStart(2, '0')}`;

  const bodyPreview = markdownExcerpt(note.body ?? '');
  const previewText = bodyPreview.length > 120 ? bodyPreview.slice(0, 120) + '…' : bodyPreview;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: activeTheme.spacing[2],
        backgroundColor: activeTheme.colors.surface,
        borderRadius: activeTheme.borderRadii.md,
        padding: activeTheme.spacing[4],
        borderWidth: 1,
        borderColor: activeTheme.colors.separator,
      }}
    >
      <Pressable
        onPress={() => onPress(note)}
        accessibilityRole="button"
        accessibilityLabel={`笔记：${note.title}`}
        style={({ pressed }) => ({ flex: 1, minWidth: 0, opacity: pressed ? 0.8 : 1 })}
      >
        <View style={{ flexDirection: 'row', gap: activeTheme.spacing[3] }}>
          <Stack gap={1} style={{ flex: 1 }}>
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
        </View>
      </Pressable>
      {onDelete ? <CardActionsMenu label={`删除笔记：${note.title}`} onPress={onDelete} /> : null}
    </View>
  );
}
