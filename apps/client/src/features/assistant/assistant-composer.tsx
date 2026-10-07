import { forwardRef, useState, type ReactNode } from 'react';
import { TextInput, View } from 'react-native';
import ArrowUp from 'lucide-react-native/icons/arrow-up';
import { Button, IconButton, Inline, Stack, Text } from '../../ui/primitives';
import { theme } from '../../ui/theme';

/** The message box shared by the assistant home and a conversation. */
export const AssistantComposer = forwardRef<TextInput, {
  value: string; onChangeText(value: string): void; onSend(): void; blocked: boolean; busy: boolean; modelControl?: ReactNode;
  /** Names the field by what sending does; the home and a conversation can both be mounted. */
  label?: string;
}>(({ value, onChangeText, onSend, blocked, busy, modelControl, label = '发送给助手' }, ref) => {
  const [focused, setFocused] = useState(false);
  const unavailable = blocked || !value.trim();
  return <Stack gap={1} style={{ backgroundColor: theme.colors.surface, borderRadius: theme.borderRadii.xl, borderWidth: theme.borderWidths.default, borderColor: focused ? theme.colors.focusRing : theme.colors.separator, padding: theme.spacing[3] }}>
    <TextInput ref={ref} accessibilityLabel={label} multiline value={value} onChangeText={onChangeText} maxLength={8000} editable={!blocked}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholder="想问什么，或想做点什么？" placeholderTextColor={theme.colors.inkMuted}
      style={{ ...theme.typography.body, fontFamily: theme.fontFamilies.regular, color: theme.colors.ink, minHeight: theme.controlSizes.touchTarget, maxHeight: theme.controlSizes.field * 3, padding: theme.spacing[1], textAlignVertical: 'top', outlineWidth: 0 }} />
    <Inline style={{ justifyContent: 'space-between' }}><View style={{ flex: 1, minWidth: 0 }}>{modelControl ?? <Text variant="caption">内容修改前，由你确认</Text>}</View><IconButton label="发送" disabled={unavailable} accessibilityState={{ disabled: unavailable, busy }}
      icon={<ArrowUp size={theme.controlSizes.icon} color={unavailable ? theme.colors.inkMuted : theme.colors.surface} />} onPress={onSend}
      style={{ backgroundColor: unavailable ? theme.colors.surfaceMuted : theme.colors.primary, borderRadius: theme.borderRadii.lg }} /></Inline>
  </Stack>;
});

AssistantComposer.displayName = 'AssistantComposer';

const suggestions = ['这周有哪些安排，需要提前准备什么？', '帮我整理最近的家庭笔记'];

/** Starter questions as small chips that wrap, so they fill one or two lines instead of a stack of full buttons. */
export function PromptSuggestions({ disabled, onPick }: { disabled: boolean; onPick(prompt: string): void }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[3] }}>
    {suggestions.map(prompt => <Button key={prompt} label={prompt} tone="secondary" size="compact" disabled={disabled} onPress={() => onPick(prompt)} />)}
  </View>;
}
