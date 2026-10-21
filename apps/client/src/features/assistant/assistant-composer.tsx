import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { Platform, TextInput, View } from 'react-native';
import ArrowUp from 'lucide-react-native/icons/arrow-up';
import Check from 'lucide-react-native/icons/check';
import Mic from 'lucide-react-native/icons/mic';
import X from 'lucide-react-native/icons/x';
import { Button, IconButton, Inline, Spinner, Stack, Text } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import type { AssistantVoiceInput } from './use-assistant-voice-input';

const METER_BARS = 14;

/** A rolling input level, so the speaker can see they are being heard. Hidden where the platform reports no level. */
function VoiceMeter({ level }: { level(): number | null }) {
  const read = useRef(level);
  read.current = level;
  const [bars, setBars] = useState<number[] | null>(null);
  useEffect(() => {
    const timer = setInterval(() => {
      const decibels = read.current();
      if (decibels === null) return;
      // Speech sits roughly between -50 and 0 dBFS.
      const height = Math.max(0, Math.min(1, (decibels + 50) / 50));
      setBars(previous => [...(previous ?? Array<number>(METER_BARS).fill(0)).slice(1), height]);
    }, 100);
    return () => clearInterval(timer);
  }, []);
  return <View importantForAccessibility="no-hide-descendants" aria-hidden style={{ flex: 1, minWidth: 0, height: theme.spacing[5], flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: theme.spacing[1], overflow: 'hidden' }}>
    {bars?.map((height, index) => <View key={index} style={{ width: theme.borderWidths.default * 3, height: theme.spacing[1] + height * theme.spacing[4], borderRadius: theme.borderRadii.full, backgroundColor: theme.colors.inkMuted }} />)}
  </View>;
}

function elapsedLabel(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Replaces the model and send row while the microphone is in use: cancel, what is happening, finish. */
function VoiceBar({ voice, finishRef }: { voice: AssistantVoiceInput; finishRef: React.Ref<View> }) {
  const recording = voice.phase === 'recording';
  return <Inline gap={2} style={{ alignItems: 'center' }}>
    <IconButton label="取消语音输入" appearance="plain" icon={<X size={theme.controlSizes.icon} color={theme.colors.inkMuted} />} onPress={voice.cancel} />
    <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] }}>
      {voice.phase === 'transcribing' ? <Spinner label="正在转写" /> : null}
      {/* Vermilion marks "now": the microphone is open. */}
      {recording ? <View importantForAccessibility="no-hide-descendants" aria-hidden style={{ width: theme.spacing[2], height: theme.spacing[2], borderRadius: theme.borderRadii.full, backgroundColor: theme.colors.accent }} /> : null}
      <Text variant="bodySm" color={recording ? 'ink' : 'inkMuted'} accessibilityLiveRegion="polite" aria-live="polite">
        {voice.phase === 'starting' ? '正在打开麦克风…' : voice.phase === 'transcribing' ? '正在转写…' : '正在录音'}
      </Text>
      {recording ? <><VoiceMeter level={voice.level} /><Text variant="time" color="inkMuted">{elapsedLabel(voice.elapsed)}</Text></> : null}
    </View>
    <IconButton ref={finishRef} label="完成录音" disabled={!recording} accessibilityState={{ disabled: !recording }}
      icon={<Check size={theme.controlSizes.icon} color={recording ? theme.colors.surface : theme.colors.inkMuted} />} onPress={voice.finish}
      style={{ backgroundColor: recording ? theme.colors.primary : theme.colors.surfaceMuted, borderRadius: theme.borderRadii.lg }} />
  </Inline>;
}

/** The message box shared by the assistant home and a conversation. */
export const AssistantComposer = forwardRef<TextInput, {
  value: string; onChangeText(value: string): void; onSend(): void; blocked: boolean; busy: boolean; modelControl?: ReactNode;
  /** Names the field by what sending does; the home and a conversation can both be mounted. */
  label?: string;
  voice?: AssistantVoiceInput;
}>(({ value, onChangeText, onSend, blocked, busy, modelControl, voice, label = '发送给助手' }, ref) => {
  const [focused, setFocused] = useState(false);
  const input = useRef<TextInput>(null);
  const finish = useRef<View>(null);
  useImperativeHandle(ref, () => input.current!, []);
  const engaged = Boolean(voice?.engaged);
  const unavailable = blocked || engaged || !value.trim();
  // The microphone button leaves the page while it is in use; keyboard focus follows the voice controls and comes back to the text.
  const phase = voice?.phase ?? 'idle';
  const previous = useRef(phase);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (phase === 'recording') (finish.current as unknown as HTMLElement | null)?.focus();
    else if (phase === 'idle' && previous.current !== 'idle') input.current?.focus();
    previous.current = phase;
  }, [phase]);
  return <Stack gap={1} style={{ backgroundColor: theme.colors.surface, borderRadius: theme.borderRadii.xl, borderWidth: theme.borderWidths.default, borderColor: focused ? theme.colors.focusRing : theme.colors.separator, padding: theme.spacing[3] }}>
    <TextInput ref={input} accessibilityLabel={label} multiline value={value} onChangeText={onChangeText} maxLength={8000} editable={!blocked && !engaged}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} placeholder="想问什么，或想做点什么？" placeholderTextColor={theme.colors.inkMuted}
      style={{ ...theme.typography.body, fontFamily: theme.fontFamilies.regular, color: theme.colors.ink, minHeight: theme.controlSizes.touchTarget, maxHeight: theme.controlSizes.field * 3, padding: theme.spacing[1], textAlignVertical: 'top', outlineWidth: 0 }} />
    {voice?.notice ? <Inline gap={2} style={{ alignItems: 'center', flexWrap: 'wrap', paddingHorizontal: theme.spacing[1] }}>
      <Text variant="bodySm" color="inkMuted" accessibilityLiveRegion="polite" aria-live="polite" style={{ flex: 1, minWidth: 0 }}>{voice.notice}</Text>
      {voice.settings ? <Button label="打开设置" size="compact" tone="secondary" onPress={() => { void voice.openSettings(); }} /> : null}
    </Inline> : null}
    {voice && engaged ? <VoiceBar voice={voice} finishRef={finish} /> : <Inline style={{ justifyContent: 'space-between' }}>
      <View style={{ flex: 1, minWidth: 0 }}>{modelControl ?? <Text variant="caption">内容修改前，由你确认</Text>}</View>
      {voice?.available ? <IconButton label="语音输入" appearance="plain" disabled={blocked} accessibilityState={{ disabled: blocked }}
        icon={<Mic size={theme.controlSizes.icon} color={blocked ? theme.colors.inkMuted : theme.colors.ink} />} onPress={voice.start} /> : null}
      <IconButton label="发送" disabled={unavailable} accessibilityState={{ disabled: unavailable, busy }}
        icon={<ArrowUp size={theme.controlSizes.icon} color={unavailable ? theme.colors.inkMuted : theme.colors.surface} />} onPress={onSend}
        style={{ backgroundColor: unavailable ? theme.colors.surfaceMuted : theme.colors.primary, borderRadius: theme.borderRadii.lg }} />
    </Inline>}
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
