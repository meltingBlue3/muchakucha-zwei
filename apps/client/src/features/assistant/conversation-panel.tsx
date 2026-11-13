import { useTranslation } from '../../i18n';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import type { AssistantConversationResponseDto } from '@muchakucha/api-client';
import Sparkles from 'lucide-react-native/icons/sparkles';
import Layers from 'lucide-react-native/icons/layers';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import { AppDialog } from '../../ui/app-dialog';
import { Button, Heading, Inline, LoadingState, Stack, Text } from '../../ui/primitives';
import { scrollKeyboardDismissMode } from '../../ui/keyboard-area';
import { theme } from '../../ui/theme';
import { assistantConversationRecords, type AssistantConversationRecord, type AssistantSource } from './conversation-records';
import { AssistantComposer, PromptSuggestions } from './assistant-composer';
import { useAssistantVoiceInput } from './use-assistant-voice-input';
import { MarkdownBody } from '../notes/markdown-body';
import { useDesktop } from '../../ui/use-desktop';

const sectionResources = { events: 'event', tasks: 'task', notes: 'note' } as const;

function QueryRecord({ record, onOpenSource }: { record: AssistantConversationRecord; onOpenSource?: ((link: NonNullable<AssistantSource['link']>) => void) | undefined }) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation('assistant');
  const trigger = useRef<View>(null);
  return <>
    <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={t('panel.evidenceLink', { content: record.content })} onPress={() => setOpen(true)} style={({ pressed }) => ({ flexDirection: 'row', gap: theme.spacing[2], alignItems: 'center', minHeight: theme.controlSizes.touchTarget, paddingVertical: theme.spacing[2], borderRadius: theme.borderRadii.sm, backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.transparent })}>
      <Layers size={theme.controlSizes.icon} color={theme.colors.inkMuted} /><Text variant="caption" color={record.failed ? 'destructive' : 'inkMuted'} style={{ flex: 1 }}>{record.content}</Text><ChevronRight size={theme.controlSizes.icon} color={theme.colors.inkMuted} />
    </Pressable>
    {open ? <AppDialog title={t('panel.evidence')} size="sheet" busy={false} trigger={trigger} onClose={() => setOpen(false)}><Stack gap={4}>
      <Text variant="bodySm">{t('panel.snapshot')}</Text>
      <Text>{record.content}</Text>
      {record.sources?.map((source, index) => <Stack key={index} gap={2} style={{ borderTopWidth: theme.borderWidths.default, borderTopColor: theme.colors.separator, paddingTop: theme.spacing[4] }}>
        <Inline gap={3} style={{ alignItems: 'flex-start' }}><Heading variant="section" level={2} style={{ flex: 1 }}>{source.title}</Heading>
          {source.link && onOpenSource ? <Button label={t('panel.open')} accessibilityLabel={t('panel.openRecord', { resource: t(`resources.${sectionResources[source.link.section]}`), title: source.title })} tone="secondary" size="compact"
            onPress={() => { const link = source.link!; setOpen(false); onOpenSource(link); }} /> : null}</Inline>
        {source.excerpt ? <Text selectable>{source.excerpt}</Text> : null}</Stack>)}
    </Stack></AppDialog> : null}
  </>;
}

const userBubble = { alignSelf: 'flex-end', maxWidth: '90%', backgroundColor: theme.colors.surfaceSelected, padding: theme.spacing[4], borderRadius: theme.borderRadii.lg, borderBottomRightRadius: theme.borderRadii.sm } as const;

/** `onSend` resolves false when the message may not have reached the server; its text is then given back. */
export function AssistantConversationPanel({ conversation, busy, disabled, onSend, modelControl, feedback, pendingPreview, draft, outgoing = null, onOpenSource, voiceInput }: {
  conversation: AssistantConversationResponseDto; busy: boolean; disabled: boolean; onSend: (message: string) => Promise<boolean>;
  modelControl?: ReactNode; feedback?: ReactNode; pendingPreview?: ReactNode; draft?: { value: string; revision: number };
  /** A sent message the transcript does not include yet. */
  outgoing?: string | null;
  onOpenSource?: (link: NonNullable<AssistantSource['link']>) => void;
  /** The transcription configuration voice input sends recordings to; without one there is no microphone. */
  voiceInput?: { householdId: string; providerId: string | null };
}) {
  const [message, setMessage] = useState('');
  const { t } = useTranslation('assistant');
  const scroll = useRef<ScrollView>(null);
  const input = useRef<TextInput>(null);
  const followEnd = useRef(true);
  const sending = useRef(false);
  const blocked = busy || disabled || conversation.pendingActions.length > 0 || conversation.state === 'running';
  const voice = useAssistantVoiceInput({ householdId: voiceInput?.householdId ?? '', providerId: voiceInput?.providerId ?? null, value: message, onChangeText: setMessage, blocked });
  useEffect(() => { if (draft) { setMessage(draft.value); input.current?.focus(); } }, [draft]);
  const send = async () => {
    const text = message.trim();
    if (blocked || voice.engaged || !text || sending.current) return;
    sending.current = true;
    followEnd.current = true;
    setMessage('');
    try {
      if (!(await onSend(text))) setMessage(current => current || text);
    } finally { sending.current = false; }
  };
  const records = useMemo(() => assistantConversationRecords(conversation.messages, t), [conversation.messages, t]);
  const desktop = useDesktop();
  const bubble = desktop ? { ...userBubble, paddingVertical: theme.spacing[2] + 2, paddingHorizontal: theme.spacing[4] } : userBubble;
  const userText = desktop ? theme.typography.chatBody : undefined;
  return <View style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
    <ScrollView ref={scroll} testID="assistant-transcript" style={{ flex: 1, minHeight: 0 }} keyboardDismissMode={scrollKeyboardDismissMode} keyboardShouldPersistTaps="handled"
      onScroll={event => { const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent; followEnd.current = contentSize.height - layoutMeasurement.height - contentOffset.y < theme.spacing[16]; }} scrollEventThrottle={100}
      onContentSizeChange={() => { if (followEnd.current) scroll.current?.scrollToEnd({ animated: false }); }}
      contentContainerStyle={{ flexGrow: 1, padding: theme.spacing[5], gap: theme.spacing[5], width: '100%', maxWidth: theme.layout.assistantReadingWidth, alignSelf: 'center' }}>
      {records.length === 0 && !outgoing ? <Stack gap={4} style={{ flex: 1, justifyContent: 'center', paddingVertical: theme.spacing[8] }}>
        <Sparkles size={theme.spacing[8]} color={theme.colors.ink} strokeWidth={theme.controlSizes.iconStroke} /><Heading variant="heading" level={2}>{t('panel.welcome')}</Heading><Text color="inkMuted">{t('panel.welcomeDetail')}</Text>
        <PromptSuggestions disabled={blocked || voice.engaged} onPick={prompt => { setMessage(prompt); input.current?.focus(); }} />
      </Stack> : records.map((item, index) => item.kind === 'query' ? <QueryRecord key={index} record={item} onOpenSource={onOpenSource} /> : <Stack key={index} gap={desktop ? 1 : 2} style={item.kind === 'user'
        ? bubble
        : item.kind === 'operation' ? { padding: theme.spacing[3], borderRadius: theme.borderRadii.md, backgroundColor: item.failed ? theme.colors.destructiveSoft : theme.colors.successSoft }
        : { paddingVertical: theme.spacing[1] }}>
        {item.kind !== 'user' ? <Inline gap={2}>{item.kind === 'assistant' ? <Sparkles size={theme.controlSizes.icon} color={theme.colors.ink} strokeWidth={theme.controlSizes.iconStroke} /> : <CircleCheck size={theme.controlSizes.icon} color={item.failed ? theme.colors.destructive : theme.colors.success} />}<Text variant="caption" color={item.kind === 'assistant' ? 'ink' : 'inkMuted'}>{item.kind === 'operation' ? t('panel.execution') : t('assistant')}</Text></Inline> : null}
        {item.kind === 'assistant' ? <MarkdownBody chat source={item.content} tableLabel={t('panel.table')} headingOffset={1} /> : <Text selectable variant={item.kind === 'operation' ? 'bodySm' : 'body'} color={item.failed ? 'destructive' : 'ink'} style={item.kind === 'user' ? userText : undefined}>{item.content}</Text>}
      </Stack>)}
      {outgoing ? <Stack gap={2} style={bubble}><Text selectable style={userText}>{outgoing}</Text></Stack> : null}
      {pendingPreview}
      {busy || conversation.state === 'running' ? <LoadingState label={t('panel.working')} /> : null}
    </ScrollView>
    <Stack gap={2} style={{ paddingHorizontal: theme.spacing[4], paddingTop: theme.spacing[2], paddingBottom: theme.spacing[3], width: '100%', maxWidth: theme.layout.assistantReadingWidth, alignSelf: 'center' }}>
      {feedback}
      {conversation.pendingActions.length ? <Text variant="caption">{t('panel.pending')}</Text> : null}
      <AssistantComposer ref={input} value={message} onChangeText={setMessage} onSend={() => { void send(); }} blocked={blocked} busy={busy} voice={voice} modelControl={modelControl} />
    </Stack>
  </View>;
}
