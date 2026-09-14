import { useWorkspaceState } from '../../ui/workspace-state';
import { useCallback, useState } from 'react';
import { TextInput } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { CreateNoteDto, NoteResponseDto } from '@muchakucha/api-client';
import type { Theme } from '../../ui/theme';
import { Stack, Text, FormActions } from '../../ui/primitives';

export interface NoteInput {
  title: string;
  body: string;
}

const EMPTY_NOTE: NoteInput = {
  title: '',
  body: '',
};

interface NoteFormProps {
  draftKey?: string;
  initial?: NoteResponseDto;
  onSubmit: (data: CreateNoteDto) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  isSubmitting: boolean;
}

export function NoteForm({ draftKey, initial, onSubmit, onCancel, submitLabel, isSubmitting }: NoteFormProps) {
  const activeTheme = useTheme<Theme>();
  const [form, setForm] = useWorkspaceState<NoteInput>(draftKey, () => {
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
  }, [setForm]);

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
    borderRadius: activeTheme.borderRadii.md,
    paddingHorizontal: activeTheme.spacing[4],
    paddingVertical: activeTheme.spacing[3],
    fontSize: activeTheme.typography.body.fontSize,
    fontFamily: activeTheme.fontFamilies.regular,
    lineHeight: activeTheme.typography.body.lineHeight,
    color: activeTheme.colors.ink,
    minHeight: activeTheme.controlSizes.field,
  };

  return (
    <Stack gap={4}>
      {draftKey ? <Text variant="caption">未保存内容会在本次登录期间暂存。保存成功后清除。</Text> : null}
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

      <FormActions onCancel={onCancel} onSubmit={() => void handleSubmit()} submitting={isSubmitting} submitLabel={submitLabel} />
    </Stack>
  );
}
