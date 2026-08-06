import { useCallback, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { CreateNoteDto, NoteResponseDto } from '@muchakucha/api-client';
import type { Theme } from '../../ui/theme';
import { Stack, Text } from '../../ui/primitives';

export interface NoteInput {
  title: string;
  body: string;
}

const EMPTY_NOTE: NoteInput = {
  title: '',
  body: '',
};

interface NoteFormProps {
  initial?: NoteResponseDto;
  onSubmit: (data: CreateNoteDto) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  isSubmitting: boolean;
}

export function NoteForm({ initial, onSubmit, onCancel, submitLabel, isSubmitting }: NoteFormProps) {
  const activeTheme = useTheme<Theme>();
  const [form, setForm] = useState<NoteInput>(() => {
    if (initial) {
      return {
        title: initial.title,
        body: initial.body ?? '',
      };
    }
    return { ...EMPTY_NOTE };
  });
  const [error, setError] = useState<string | null>(null);

  const updateField = useCallback(<K extends keyof NoteInput>(key: K, value: NoteInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (form.title.trim().length === 0) {
      setError('请输入笔记标题。');
      return;
    }

    const data: CreateNoteDto = {
      title: form.title.trim(),
    };
    if (form.body.trim() !== '') data.body = form.body.trim();

    await onSubmit(data);
  }, [form, onSubmit]);

  const inputStyle = {
    backgroundColor: activeTheme.colors.surface,
    borderWidth: 1,
    borderColor: activeTheme.colors.border,
    borderRadius: activeTheme.borderRadii.sm,
    paddingHorizontal: activeTheme.spacing[4],
    paddingVertical: activeTheme.spacing[3],
    fontSize: activeTheme.typography.body.fontSize,
    color: activeTheme.colors.ink,
    minHeight: activeTheme.controlSizes.field,
  };

  return (
    <Stack gap={4}>
      {/* Title */}
      <Stack gap={1}>
        <Text variant="label">标题</Text>
        <TextInput
          value={form.title}
          onChangeText={(v) => updateField('title', v)}
          placeholder="笔记标题"
          placeholderTextColor={activeTheme.colors.inkMuted}
          style={inputStyle}
          maxLength={200}
          accessibilityLabel="笔记标题"
        />
      </Stack>

      {/* Body */}
      <Stack gap={1}>
        <Text variant="label">内容（可选，支持 Markdown）</Text>
        <TextInput
          value={form.body}
          onChangeText={(v) => updateField('body', v)}
          placeholder="笔记内容..."
          placeholderTextColor={activeTheme.colors.inkMuted}
          style={[inputStyle, { minHeight: 160, textAlignVertical: 'top' }]}
          multiline
          numberOfLines={8}
          accessibilityLabel="笔记内容"
        />
      </Stack>

      {/* Error */}
      {error !== null && (
        <Text variant="bodySm" color="destructive">
          {error}
        </Text>
      )}

      {/* Actions */}
      <View
        style={{
          flexDirection: 'row',
          gap: activeTheme.spacing[3],
          marginTop: activeTheme.spacing[2],
        }}
      >
        <Pressable
          onPress={onCancel}
          disabled={isSubmitting}
          style={({ pressed }) => ({
            flex: 1,
            alignItems: 'center',
            paddingVertical: activeTheme.spacing[3],
            borderRadius: activeTheme.borderRadii.sm,
            borderWidth: 1,
            borderColor: activeTheme.colors.border,
            opacity: pressed ? 0.7 : 1,
          })}
          accessibilityLabel="取消"
        >
          <Text variant="button" color="ink">
            取消
          </Text>
        </Pressable>
        <Pressable
          onPress={handleSubmit}
          disabled={isSubmitting}
          style={({ pressed }) => ({
            flex: 1,
            alignItems: 'center',
            paddingVertical: activeTheme.spacing[3],
            borderRadius: activeTheme.borderRadii.sm,
            backgroundColor: isSubmitting
              ? activeTheme.colors.disabled
              : pressed
                ? activeTheme.colors.coralPressed
                : activeTheme.colors.coral,
          })}
          accessibilityLabel={submitLabel}
        >
          <Text variant="button" color="surface">
            {isSubmitting ? '保存中…' : submitLabel}
          </Text>
        </Pressable>
      </View>
    </Stack>
  );
}
