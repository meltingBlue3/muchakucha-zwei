import { Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { NoteResponseDto } from '@muchakucha/api-client';
import FileText from 'lucide-react-native/icons/file-text';
import type { Theme } from '../../ui/theme';
import { Stack, Text } from '../../ui/primitives';

interface NoteCardProps {
  note: NoteResponseDto;
  onPress: (note: NoteResponseDto) => void;
}

export function NoteCard({ note, onPress }: NoteCardProps) {
  const activeTheme = useTheme<Theme>();

  const updatedDate = new Date(note.updatedAt);
  const dateLabel = `${updatedDate.getFullYear()}-${String(updatedDate.getMonth() + 1).padStart(2, '0')}-${String(updatedDate.getDate()).padStart(2, '0')}`;

  const bodyPreview = (note.body ?? '').trim();
  const previewText = bodyPreview.length > 120 ? bodyPreview.slice(0, 120) + '…' : bodyPreview;

  return (
    <Pressable
      onPress={() => onPress(note)}
      accessibilityRole="button"
      accessibilityLabel={`笔记：${note.title}`}
      style={({ pressed }) => ({
        backgroundColor: activeTheme.colors.surface,
        borderRadius: activeTheme.borderRadii.xl,
        padding: activeTheme.spacing[5],
        borderWidth: 1,
        borderColor: activeTheme.colors.separator,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', gap: activeTheme.spacing[3] }}>
        <View style={{ padding: activeTheme.spacing[3], backgroundColor: activeTheme.colors.tealSoft, borderRadius: activeTheme.borderRadii.lg, alignSelf: 'flex-start' }}>
          <FileText size={20} color={activeTheme.colors.teal} strokeWidth={1.5} />
        </View>
        <Stack gap={3} style={{ flex: 1 }}>
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
  );
}
