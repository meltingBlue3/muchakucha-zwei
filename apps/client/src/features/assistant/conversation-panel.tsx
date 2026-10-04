import { useState } from 'react';
import type { AssistantConversationResponseDto } from '@muchakucha/api-client';
import { Button, EmptyState, LoadingState, Stack, Text, TextField } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import { assistantConversationRecords } from './conversation-records';

export function AssistantConversationPanel({ conversation, busy, disabled, onSend }: {
  conversation: AssistantConversationResponseDto; busy: boolean; disabled: boolean; onSend: (message: string) => Promise<boolean>;
}) {
  const [message, setMessage] = useState('');
  const blocked = busy || disabled || conversation.pendingAction !== null || conversation.state === 'running';
  const send = async () => {
    const text = message.trim();
    if (blocked || !text) return;
    if (await onSend(text)) setMessage('');
  };
  const visibleMessages = assistantConversationRecords(conversation.messages);
  return <Stack gap={4}>
    {visibleMessages.length === 0 ? <EmptyState title="从一个问题开始" message="例如：帮我看看这周有什么安排；把明天下午三点的家长会加入日程；整理最近的笔记。" /> : visibleMessages.map((item, index) => <Stack key={index} gap={2} style={{ padding: theme.spacing[4], borderRadius: theme.borderRadii.xl, backgroundColor: item.kind === 'user' ? theme.colors.coralSoft : theme.colors.surface }}>
      <Text variant="label" color={item.kind === 'user' ? 'link' : 'inkMuted'}>{item.kind === 'user' ? '你' : item.kind === 'query' ? '查询记录' : item.kind === 'operation' ? '执行记录' : '助手'}</Text>
      <Text selectable variant={item.kind === 'query' ? 'bodySm' : 'body'} color={item.failed ? 'destructive' : item.kind === 'operation' ? 'teal' : 'ink'}>{item.content}</Text>
    </Stack>)}
    {busy || conversation.state === 'running' ? <LoadingState label="助手正在处理" /> : null}
    <TextField label="发送给助手" multiline value={message} onChangeText={setMessage} maxLength={8000} disabled={blocked}
      placeholder="描述你想了解或整理的内容" style={{ minHeight: theme.controlSizes.field * 2, paddingVertical: theme.spacing[3], textAlignVertical: 'top' }}
      hint={conversation.pendingAction ? '请先确认或取消上方的待执行操作。' : '助手可能出错，请核对重要信息。'} />
    <Button label="发送" loading={busy} disabled={blocked || !message.trim()} onPress={() => { void send(); }} />
  </Stack>;
}
