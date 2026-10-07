import { useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import type { AssistantConversationSummaryDto } from '@muchakucha/api-client';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import PanelLeft from 'lucide-react-native/icons/panel-left';
import SquarePen from 'lucide-react-native/icons/square-pen';
import Ellipsis from 'lucide-react-native/icons/ellipsis';
import Settings from 'lucide-react-native/icons/settings';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import Trash2 from 'lucide-react-native/icons/trash-2';
import { HouseholdScreen } from '../households/household-screen';
import { AppDialog } from '../../ui/app-dialog';
import { Button, Heading, IconButton, Inline, Stack, Text } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import { formatDateTime } from '../../ui/date-values';
import { assistantPath } from './assistant-boundary';
import { MenuRow } from './menu-row';

export function AssistantWorkspace({ householdId, householdName, title, conversationId, conversations, busy, children, onRefresh, onDelete }: {
  householdId: string; householdName: string; title: string; conversationId?: string;
  conversations: AssistantConversationSummaryDto[]; busy: boolean; children: ReactNode;
  onRefresh(): void; onDelete?: () => void;
}) {
  const router = useRouter();
  const wide = useWindowDimensions().width >= theme.layout.navigationBreakpoint;
  const [dialog, setDialog] = useState<'history' | 'options' | null>(null);
  const historyTrigger = useRef<View>(null);
  const optionsTrigger = useRef<View>(null);
  const root = assistantPath(householdId);
  const startNew = () => { setDialog(null); router.push(root); };
  // The caption lines up with the titles inside the rows, like 「家庭」 above the sidebar's family pages.
  const history = <Stack gap={3}>
    <Text variant="caption" style={{ paddingHorizontal: theme.spacing[3] }}>最近对话 · 仅自己可见</Text>
    {conversations.length === 0 ? <Text variant="bodySm" style={{ paddingHorizontal: theme.spacing[3] }}>你的对话会保存在这里。</Text> : conversations.map(item => <Pressable key={item.id}
      accessibilityRole="button" accessibilityLabel={`打开对话：${item.title}`} accessibilityState={{ selected: item.id === conversationId, disabled: busy }} disabled={busy}
      onPress={() => { setDialog(null); if (item.id !== conversationId) router.push(`${root}/conversations/${encodeURIComponent(item.id)}`); }}
      style={({ pressed }) => ({ padding: theme.spacing[3], gap: theme.spacing[1], borderRadius: theme.borderRadii.md, backgroundColor: item.id === conversationId ? theme.colors.surfaceSelected : pressed ? theme.colors.surfaceMuted : theme.colors.transparent })}>
      <Text variant="bodySm" color="ink" numberOfLines={2}>{item.title}</Text><Text variant="caption">{formatDateTime(new Date(item.updatedAt))}</Text>
    </Pressable>)}
  </Stack>;
  // A conversation on a phone is a focused view: back to the assistant, no tab bar.
  return <HouseholdScreen active="assistant" layout="workspace" headerRow={false} tabBar={!conversationId} accessibilityLabel={conversationId ? '助手对话' : '家庭助手'}
    sidebar={<ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ paddingBottom: theme.spacing[5], gap: theme.spacing[3] }}>
      <Button label="新对话" tone="secondary" disabled={busy} onPress={startNew} />{history}
    </ScrollView>}>
    <Inline style={{ paddingLeft: !wide && conversationId ? theme.spacing[1] : theme.spacing[5], paddingRight: theme.spacing[2], paddingVertical: theme.spacing[2], borderBottomWidth: theme.borderWidths.default, borderBottomColor: theme.colors.separator }}>
      {!wide && conversationId ? <IconButton label="返回" appearance="plain" icon={<ArrowLeft size={theme.controlSizes.icon} color={theme.colors.ink} strokeWidth={theme.controlSizes.iconStroke} />} onPress={() => router.replace(root)} /> : null}
      <Stack gap={1} style={{ flex: 1, minWidth: 0 }}><Heading variant="section" level={1} numberOfLines={1}>{title}</Heading><Text variant="caption" numberOfLines={1}>{householdName} · 对话仅自己可见</Text></Stack>
      {!wide ? <IconButton ref={historyTrigger} label="我的对话" appearance="plain" disabled={busy} icon={<PanelLeft size={theme.controlSizes.icon} color={theme.colors.inkMuted} />} onPress={() => setDialog('history')} /> : <IconButton label="新对话" appearance="plain" disabled={busy} icon={<SquarePen size={theme.controlSizes.icon} color={theme.colors.inkMuted} />} onPress={() => router.push(root)} />}
      <IconButton ref={optionsTrigger} label="助手选项" appearance="plain" disabled={busy} icon={<Ellipsis size={theme.controlSizes.icon} color={theme.colors.inkMuted} />} onPress={() => setDialog('options')} />
    </Inline>
    {children}
    {/* On a phone the sheet's own action sits beside its title, and options read as a menu rather than a stack of buttons. */}
    {dialog ? <AppDialog title={dialog === 'history' ? '我的对话' : '助手选项'} size="sheet" trigger={dialog === 'history' ? historyTrigger : optionsTrigger} busy={busy} onClose={() => setDialog(null)}
      headerActions={dialog === 'history' ? <Button label="新对话" tone="secondary" size="compact" disabled={busy} onPress={startNew} /> : null}>
      {dialog === 'history' ? history : <Stack gap={3}>
        <View>
          <MenuRow label="模型配置" icon={Settings} opensPage onPress={() => { setDialog(null); router.push(`${root}/providers`); }} />
          <MenuRow label="刷新对话列表和状态" icon={RefreshCw} onPress={() => { setDialog(null); onRefresh(); }} />
          {onDelete ? <MenuRow label="删除对话" icon={Trash2} destructive onPress={() => { setDialog(null); onDelete(); }} /> : null}
        </View>
        <Text variant="bodySm">共享模型只共享使用权限，不共享你的对话记录。</Text>
      </Stack>}
    </AppDialog> : null}
  </HouseholdScreen>;
}
