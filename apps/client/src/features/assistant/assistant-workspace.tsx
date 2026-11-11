import { useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import type { AssistantConversationSummaryDto } from '@muchakucha/api-client';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import PanelLeft from 'lucide-react-native/icons/panel-left';
import SquarePen from 'lucide-react-native/icons/square-pen';
import Ellipsis from 'lucide-react-native/icons/ellipsis';
import Settings from 'lucide-react-native/icons/settings';
import Settings2 from 'lucide-react-native/icons/settings-2';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import Trash2 from 'lucide-react-native/icons/trash-2';
import { HouseholdScreen } from '../households/household-screen';
import { AppDialog } from '../../ui/app-dialog';
import { Button, Heading, IconButton, Inline, Stack, Text } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import { formatDate, formatDateTime, toDateValue, toTimeValue } from '../../ui/date-values';
import { assistantPath } from './assistant-boundary';
import { MenuRow } from './menu-row';
import { useDesktop } from '../../ui/use-desktop';

export function AssistantWorkspace({ householdId, householdName, title, conversationId, conversations, busy, children, inspector, onRefresh, onDelete }: {
  householdId: string; householdName: string; title: string; conversationId?: string;
  /** A third column beside the conversation, full height, such as the actions waiting for confirmation. */
  inspector?: ReactNode;
  conversations: AssistantConversationSummaryDto[]; busy: boolean; children: ReactNode;
  onRefresh(): void; onDelete?: () => void;
}) {
  const router = useRouter();
  const wide = useWindowDimensions().width >= theme.layout.navigationBreakpoint;
  const desktop = useDesktop();
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
  // The desktop list: who can see it, then today's conversations by time and earlier ones by date.
  const todayValue = toDateValue(new Date());
  const historyGroups = [
    { title: '今天', items: conversations.filter(item => toDateValue(new Date(item.updatedAt)) === todayValue) },
    { title: '更早', items: conversations.filter(item => toDateValue(new Date(item.updatedAt)) !== todayValue) },
  ].filter(group => group.items.length);
  const desktopHistory = <Stack gap={3}>
    <Text variant="caption" color="inkFaint" style={{ paddingHorizontal: theme.spacing[3], fontWeight: '400' }}>对话仅自己可见</Text>
    {conversations.length === 0 ? <Text variant="meta" style={{ paddingHorizontal: theme.spacing[3] }}>你的对话会保存在这里。</Text> : historyGroups.map(group => <Stack key={group.title} gap={1}>
      <Text accessibilityRole="header" aria-level={3} variant="caption" color="inkFaint" style={{ paddingHorizontal: theme.spacing[3] }}>{group.title}</Text>
      {group.items.map(item => <Pressable key={item.id}
        accessibilityRole="button" accessibilityLabel={`打开对话：${item.title}`} accessibilityState={{ selected: item.id === conversationId, disabled: busy }} disabled={busy}
        onPress={() => { if (item.id !== conversationId) router.push(`${root}/conversations/${encodeURIComponent(item.id)}`); }}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ paddingHorizontal: theme.spacing[3], paddingVertical: theme.spacing[2], borderRadius: theme.borderRadii.sm, backgroundColor: item.id === conversationId ? theme.colors.surfaceSelected : pressed || hovered ? theme.colors.surfaceMuted : theme.colors.transparent })}>
        <Text variant="bodySm" color="ink" numberOfLines={1} style={{ fontWeight: item.id === conversationId ? '600' : '400' }}>{item.title}</Text>
        <Text variant="caption" color={item.id === conversationId ? 'inkMuted' : 'inkFaint'} style={{ fontWeight: '400', fontFamily: theme.fontFamilies.numeric }}>{group.title === '今天' ? toTimeValue(new Date(item.updatedAt)) : formatDate(new Date(item.updatedAt))}</Text>
      </Pressable>)}
    </Stack>)}
  </Stack>;
  const columnHeader = { height: theme.layout.pageHeaderHeight, flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2], borderBottomWidth: theme.borderWidths.default, borderBottomColor: theme.colors.separator } as const;
  // A conversation on a phone is a focused view: back to the assistant, no tab bar.
  return <HouseholdScreen active="assistant" layout="workspace" headerRow={false} tabBar={!conversationId} accessibilityLabel={conversationId ? '助手对话' : '家庭助手'}
    sidebar={!desktop ? <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ paddingBottom: theme.spacing[5], gap: theme.spacing[3] }}><Button label="新对话" tone="secondary" disabled={busy} onPress={startNew} />{history}</ScrollView> : null}>
    <View style={{ flex: 1, minHeight: 0, flexDirection: 'row' }}>
    {desktop ? <View testID="assistant-history" style={{ width: theme.layout.assistantHistoryWidth, borderRightWidth: theme.borderWidths.default, borderRightColor: theme.colors.separator }}>
      <View testID="desktop-column-header" style={{ ...columnHeader, paddingLeft: theme.spacing[5], paddingRight: theme.spacing[2] + 2 }}><Heading variant="section" level={2} style={{ flex: 1 }}>助手</Heading><IconButton label="新对话" appearance="plain" disabled={busy} icon={<SquarePen size={theme.controlSizes.icon - 3} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />} onPress={startNew} /></View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: theme.spacing[2], paddingVertical: theme.spacing[3], gap: theme.spacing[3] }}>{desktopHistory}</ScrollView>
      <Pressable accessibilityRole="link" accessibilityLabel="模型配置" onPress={() => router.push(`${root}/providers`)} style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] + 2, minHeight: theme.layout.desktopControl + theme.spacing[4], paddingHorizontal: theme.spacing[5], borderTopWidth: theme.borderWidths.default, borderTopColor: theme.colors.separator, backgroundColor: pressed || hovered ? theme.colors.surfaceSubtle : theme.colors.transparent })}>
        <Settings2 size={theme.controlSizes.icon - 4} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} /><Text variant="meta" color="inkMuted">模型配置</Text>
      </Pressable>
    </View> : null}
    <View style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
    {desktop ? <View testID="desktop-column-header" style={{ ...columnHeader, paddingLeft: theme.spacing[6] + theme.spacing[1], paddingRight: theme.spacing[2] + 2 }}>
      <Heading variant="label" level={1} numberOfLines={1} style={{ flexShrink: 1 }}>{title}</Heading>
      <Text variant="meta" color="inkFaint" numberOfLines={1} style={{ flex: 1 }}>{householdName}</Text>
      <IconButton ref={optionsTrigger} label="助手选项" appearance="plain" disabled={busy} icon={<Ellipsis size={theme.controlSizes.icon - 3} color={theme.colors.inkMuted} />} onPress={() => setDialog('options')} />
    </View> : null}
    {!desktop ? <Inline style={{ paddingLeft: !wide && conversationId ? theme.spacing[1] : theme.spacing[5], paddingRight: theme.spacing[2], paddingVertical: theme.spacing[2], borderBottomWidth: theme.borderWidths.default, borderBottomColor: theme.colors.separator }}>
      {!wide && conversationId ? <IconButton label="返回" appearance="plain" icon={<ArrowLeft size={theme.controlSizes.icon} color={theme.colors.ink} strokeWidth={theme.controlSizes.iconStroke} />} onPress={() => router.replace(root)} /> : null}
      <Stack gap={1} style={{ flex: 1, minWidth: 0 }}><Heading variant="section" level={1} numberOfLines={1}>{title}</Heading><Text variant="caption" numberOfLines={1}>{householdName} · 对话仅自己可见</Text></Stack>
      {!wide ? <IconButton ref={historyTrigger} label="我的对话" appearance="plain" disabled={busy} icon={<PanelLeft size={theme.controlSizes.icon} color={theme.colors.inkMuted} />} onPress={() => setDialog('history')} /> : <IconButton label="新对话" appearance="plain" disabled={busy} icon={<SquarePen size={theme.controlSizes.icon} color={theme.colors.inkMuted} />} onPress={() => router.push(root)} />}
      <IconButton ref={optionsTrigger} label="助手选项" appearance="plain" disabled={busy} icon={<Ellipsis size={theme.controlSizes.icon} color={theme.colors.inkMuted} />} onPress={() => setDialog('options')} />
    </Inline> : null}
    {children}
    </View>
    {inspector}
    </View>
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
