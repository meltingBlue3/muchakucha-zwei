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
import { AssistantComposer } from './assistant-composer';
import { MarkdownBody } from '../notes/markdown-body';

const sectionNames = { events: '日程', tasks: '任务', notes: '笔记' } as const;

function QueryRecord({ record, onOpenSource }: { record: AssistantConversationRecord; onOpenSource?: ((link: NonNullable<AssistantSource['link']>) => void) | undefined }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<View>(null);
  return <>
    <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={`查看查询依据：${record.content}`} onPress={() => setOpen(true)} style={({ pressed }) => ({ flexDirection: 'row', gap: theme.spacing[2], alignItems: 'center', minHeight: theme.controlSizes.touchTarget, paddingVertical: theme.spacing[2], borderRadius: theme.borderRadii.sm, backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.transparent })}>
      <Layers size={theme.controlSizes.icon} color={theme.colors.inkMuted} /><Text variant="caption" color={record.failed ? 'destructive' : 'inkMuted'} style={{ flex: 1 }}>{record.content}</Text><ChevronRight size={theme.controlSizes.icon} color={theme.colors.inkMuted} />
    </Pressable>
    {open ? <AppDialog title="查询依据" size="sheet" busy={false} trigger={trigger} onClose={() => setOpen(false)}><Stack gap={4}>
      <Text variant="bodySm">以下是本次查询时的内容，可能与当前最新数据不同。</Text>
      <Text>{record.content}</Text>
      {record.sources?.map((source, index) => <Stack key={index} gap={2} style={{ borderTopWidth: theme.borderWidths.default, borderTopColor: theme.colors.separator, paddingTop: theme.spacing[4] }}><Heading variant="section" level={2}>{source.title}</Heading>{source.excerpt ? <Text selectable>{source.excerpt}</Text> : null}
        {source.link && onOpenSource ? <Button label="打开" accessibilityLabel={`打开${sectionNames[source.link.section]}：${source.title}`} tone="secondary" style={{ alignSelf: 'flex-start' }}
          onPress={() => { const link = source.link!; setOpen(false); onOpenSource(link); }} /> : null}</Stack>)}
    </Stack></AppDialog> : null}
  </>;
}

const userBubble = { alignSelf: 'flex-end', maxWidth: '90%', backgroundColor: theme.colors.surfaceSelected, padding: theme.spacing[4], borderRadius: theme.borderRadii.lg, borderBottomRightRadius: theme.borderRadii.sm } as const;

/** `onSend` resolves false when the message may not have reached the server; its text is then given back. */
export function AssistantConversationPanel({ conversation, busy, disabled, onSend, modelControl, feedback, pendingPreview, draft, outgoing = null, onOpenSource }: {
  conversation: AssistantConversationResponseDto; busy: boolean; disabled: boolean; onSend: (message: string) => Promise<boolean>;
  modelControl?: ReactNode; feedback?: ReactNode; pendingPreview?: ReactNode; draft?: { value: string; revision: number };
  /** A sent message the transcript does not include yet. */
  outgoing?: string | null;
  onOpenSource?: (link: NonNullable<AssistantSource['link']>) => void;
}) {
  const [message, setMessage] = useState('');
  const scroll = useRef<ScrollView>(null);
  const input = useRef<TextInput>(null);
  const followEnd = useRef(true);
  const sending = useRef(false);
  const blocked = busy || disabled || conversation.pendingActions.length > 0 || conversation.state === 'running';
  useEffect(() => { if (draft) { setMessage(draft.value); input.current?.focus(); } }, [draft]);
  const send = async () => {
    const text = message.trim();
    if (blocked || !text || sending.current) return;
    sending.current = true;
    followEnd.current = true;
    setMessage('');
    try {
      if (!(await onSend(text))) setMessage(current => current || text);
    } finally { sending.current = false; }
  };
  const records = useMemo(() => assistantConversationRecords(conversation.messages), [conversation.messages]);
  return <View style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
    <ScrollView ref={scroll} testID="assistant-transcript" style={{ flex: 1, minHeight: 0 }} keyboardDismissMode={scrollKeyboardDismissMode} keyboardShouldPersistTaps="handled"
      onScroll={event => { const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent; followEnd.current = contentSize.height - layoutMeasurement.height - contentOffset.y < theme.spacing[16]; }} scrollEventThrottle={100}
      onContentSizeChange={() => { if (followEnd.current) scroll.current?.scrollToEnd({ animated: false }); }}
      contentContainerStyle={{ flexGrow: 1, padding: theme.spacing[5], gap: theme.spacing[5], width: '100%', maxWidth: theme.layout.assistantReadingWidth, alignSelf: 'center' }}>
      {records.length === 0 && !outgoing ? <Stack gap={4} style={{ flex: 1, justifyContent: 'center', paddingVertical: theme.spacing[8] }}>
        <Sparkles size={theme.spacing[8]} color={theme.colors.ink} strokeWidth={theme.controlSizes.iconStroke} /><Heading variant="heading" level={2}>今天，想一起安排什么？</Heading><Text color="inkMuted">从一个问题开始，或让我帮你记下要做的事。</Text>
        {['这周有哪些安排，需要提前准备什么？', '帮我整理最近的家庭笔记'].map(prompt => <Button key={prompt} label={prompt} tone="secondary" disabled={blocked} onPress={() => { setMessage(prompt); input.current?.focus(); }} />)}
      </Stack> : records.map((item, index) => item.kind === 'query' ? <QueryRecord key={index} record={item} onOpenSource={onOpenSource} /> : <Stack key={index} gap={2} style={item.kind === 'user'
        ? userBubble
        : item.kind === 'operation' ? { padding: theme.spacing[3], borderRadius: theme.borderRadii.md, backgroundColor: item.failed ? theme.colors.destructiveSoft : theme.colors.successSoft }
        : { paddingVertical: theme.spacing[1] }}>
        {item.kind !== 'user' ? <Inline gap={2}>{item.kind === 'assistant' ? <Sparkles size={theme.controlSizes.icon} color={theme.colors.ink} strokeWidth={theme.controlSizes.iconStroke} /> : <CircleCheck size={theme.controlSizes.icon} color={item.failed ? theme.colors.destructive : theme.colors.success} />}<Text variant="caption" color={item.kind === 'assistant' ? 'ink' : 'inkMuted'}>{item.kind === 'operation' ? '执行记录' : '助手'}</Text></Inline> : null}
        {item.kind === 'assistant' ? <MarkdownBody source={item.content} tableLabel="助手表格，可横向滚动" headingOffset={1} /> : <Text selectable variant={item.kind === 'operation' ? 'bodySm' : 'body'} color={item.failed ? 'destructive' : 'ink'}>{item.content}</Text>}
      </Stack>)}
      {outgoing ? <Stack gap={2} style={userBubble}><Text selectable>{outgoing}</Text></Stack> : null}
      {pendingPreview}
      {busy || conversation.state === 'running' ? <LoadingState label="助手正在处理" /> : null}
    </ScrollView>
    <Stack gap={2} style={{ paddingHorizontal: theme.spacing[4], paddingTop: theme.spacing[2], paddingBottom: theme.spacing[3], width: '100%', maxWidth: theme.layout.assistantReadingWidth, alignSelf: 'center' }}>
      {feedback}
      {conversation.pendingActions.length ? <Text variant="caption">请先查看并确认操作，或取消后继续对话。</Text> : null}
      <AssistantComposer ref={input} value={message} onChangeText={setMessage} onSend={() => { void send(); }} blocked={blocked} busy={busy} modelControl={modelControl} />
    </Stack>
  </View>;
}
