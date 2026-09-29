import { MarkdownEditor } from './markdown-editor';
import { DraftNotice } from '../../ui/draft-notice';
import { useWorkspaceState } from '../../ui/workspace-state';
import { useCallback, useId, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { CreateNoteDto, NoteResponseDto } from '@muchakucha/api-client';
import type { Theme } from '../../ui/theme';
import { FormMessage, Stack, FormActions } from '../../ui/primitives';
import { FormSection, titleInputStyle } from '../../ui/compose-rows';

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
  const [titleError, setTitleError] = useState<string | null>(null);
  const titleInput = useRef<TextInput>(null);
  const titleErrorId = `note-title-error-${useId()}`;

  const updateField = useCallback(<K extends keyof NoteInput>(key: K, value: NoteInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === 'title' && value.trim() !== '') setTitleError(null);
  }, [setForm]);

  const updateBody = useCallback((value: string) => updateField('body', value), [updateField]);

  const handleSubmit = useCallback(async () => {
    if (form.title.trim().length === 0) {
      setTitleError('请输入笔记标题。');
      titleInput.current?.focus();
      return;
    }

    const data: CreateNoteDto = {
      title: form.title.trim(),
    };
    // Updates omit unchanged fields, so an edit must send an empty body to clear it.
    if (initial !== undefined || form.body.trim() !== '') data.body = form.body;

    await onSubmit(data);
  }, [form, initial, onSubmit]);

  return (
    <Stack gap={0}>
      {draftKey ? <DraftNotice /> : null}
      {/* The compose layout of events and tasks: a large borderless title, then the content. Notes have no icon rows, so both start at the same edge. */}
      <View>
        <TextInput
          ref={titleInput}
          editable={!isSubmitting}
          value={form.title}
          onChangeText={(v) => updateField('title', v)}
          placeholder="添加标题"
          placeholderTextColor={activeTheme.colors.inkMuted}
          style={[titleInputStyle, { paddingHorizontal: activeTheme.spacing[2] }]}
          maxLength={200}
          accessibilityLabel="笔记标题"
          aria-invalid={titleError !== null}
          {...(titleError === null ? {} : { 'aria-describedby': titleErrorId, accessibilityHint: titleError })}
        />
        {titleError !== null ? (
          <View style={{ paddingHorizontal: activeTheme.spacing[2] }}>
            <FormMessage id={titleErrorId}>{titleError}</FormMessage>
          </View>
        ) : null}
      </View>

      <FormSection>
        <MarkdownEditor value={form.body} onChange={updateBody} disabled={isSubmitting} />
      </FormSection>

      <FormActions onCancel={onCancel} onSubmit={() => void handleSubmit()} submitting={isSubmitting} submitLabel={submitLabel} />
    </Stack>
  );
}
