import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { AssistantProviderResponseDto } from '@muchakucha/api-client';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import Sparkles from 'lucide-react-native/icons/sparkles';
import Check from 'lucide-react-native/icons/check';
import { AppDialog } from '../../ui/app-dialog';
import { Button, Inline, Stack, Text } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import { assistantPath } from './assistant-boundary';

export function AssistantModelPicker({ householdId, providers, selectedId, busy, newConversation = false, onSelect }: {
  householdId: string; providers: AssistantProviderResponseDto[]; selectedId?: string | null;
  busy: boolean; newConversation?: boolean; onSelect(id: string): void;
}) {
  const router = useRouter();
  const trigger = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const selected = providers.find(item => item.id === selectedId);
  return <>
    <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={`选择模型：${selected?.name ?? '未选择'}`} accessibilityState={{ disabled: busy, expanded: open }} disabled={busy}
      onPress={() => setOpen(true)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2], minHeight: theme.controlSizes.touchTarget, paddingHorizontal: theme.spacing[2], flexShrink: 1, borderRadius: theme.borderRadii.md, backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.transparent })}>
      <Sparkles size={theme.controlSizes.icon} color={theme.colors.inkMuted} /><Text numberOfLines={1} variant="bodySm" style={{ flexShrink: 1 }}>{selected?.name ?? '选择模型'}</Text><ChevronDown size={theme.controlSizes.icon} color={theme.colors.inkMuted} />
    </Pressable>
    {open ? <AppDialog title="选择模型" size="sheet" busy={busy} trigger={trigger} onClose={() => setOpen(false)}><Stack gap={3}>
      {newConversation ? <Text variant="bodySm">切换模型会开启新对话，当前记录保留。</Text> : null}
      {providers.map(provider => <Pressable key={provider.id} accessibilityRole="button" accessibilityLabel={`选择 ${provider.name}`} accessibilityState={{ selected: provider.id === selectedId, disabled: !provider.hasCredential }} disabled={!provider.hasCredential}
        onPress={() => { setOpen(false); if (provider.id !== selectedId) onSelect(provider.id); }}
        style={({ pressed }) => ({ borderWidth: theme.borderWidths.default, borderColor: provider.id === selectedId ? theme.colors.coral : theme.colors.separator, borderRadius: theme.borderRadii.lg, backgroundColor: pressed ? theme.colors.surfaceMuted : provider.id === selectedId ? theme.colors.coralSoft : theme.colors.surface, padding: theme.spacing[4], gap: theme.spacing[1] })}>
        <Inline><Text variant="label" style={{ flex: 1 }}>{provider.name}</Text>{provider.id === selectedId ? <Check size={theme.controlSizes.icon} color={theme.colors.coral} /> : null}</Inline>
        <Text variant="caption">{provider.model} · {provider.visibility === 'private' ? '仅自己可用' : provider.ownedByMe ? '你共享给家庭' : '家人共享'}</Text>
        <Text variant="caption">{provider.baseUrl}</Text>
        {provider.hasCredential ? null : <Text variant="caption" color="destructive">{provider.ownedByMe ? '密钥无法读取，请在模型配置中重新填写。' : '密钥无法读取，请联系配置创建者重新填写。'}</Text>}
      </Pressable>)}
      <Text variant="caption">对话和查询到的家庭数据会发送到所选服务，该服务能看到这些内容。共享模型的服务地址由配置者填写，费用也由配置者承担；配置者能看到每位家人的使用次数和用量，看不到对话内容。</Text>
      <Button label="模型配置" tone="secondary" onPress={() => { setOpen(false); router.push(`${assistantPath(householdId)}/providers`); }} />
    </Stack></AppDialog> : null}
  </>;
}
