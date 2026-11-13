import { useTranslation } from '../../i18n';
import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { AssistantProviderResponseDto } from '@muchakucha/api-client';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import Sparkles from 'lucide-react-native/icons/sparkles';
import Check from 'lucide-react-native/icons/check';
import Settings from 'lucide-react-native/icons/settings';
import { AppDialog } from '../../ui/app-dialog';
import { Inline, Stack, Text } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import { assistantPath } from './assistant-boundary';
import { MenuRow } from './menu-row';

export function AssistantModelPicker({ householdId, providers, selectedId, busy, newConversation = false, onSelect }: {
  householdId: string; providers: AssistantProviderResponseDto[]; selectedId?: string | null;
  busy: boolean; newConversation?: boolean; onSelect(id: string): void;
}) {
  const router = useRouter();
  const { t } = useTranslation('assistant');
  const trigger = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const selected = providers.find(item => item.id === selectedId);
  return <>
    <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={t('picker.current', { name: selected?.name ?? t('picker.unselected') })} accessibilityState={{ disabled: busy, expanded: open }} disabled={busy}
      onPress={() => setOpen(true)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2], minHeight: theme.controlSizes.touchTarget, paddingHorizontal: theme.spacing[2], flexShrink: 1, borderRadius: theme.borderRadii.md, backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.transparent })}>
      <Sparkles size={theme.controlSizes.icon} color={theme.colors.inkMuted} /><Text numberOfLines={1} variant="bodySm" style={{ flexShrink: 1 }}>{selected?.name ?? t('picker.selectModel')}</Text><ChevronDown size={theme.controlSizes.icon} color={theme.colors.inkMuted} />
    </Pressable>
    {open ? <AppDialog title={t('picker.selectModel')} size="sheet" busy={busy} trigger={trigger} onClose={() => setOpen(false)}><Stack gap={3}>
      {newConversation ? <Text variant="bodySm">{t('picker.switchNotice')}</Text> : null}
      {providers.map(provider => <Pressable key={provider.id} accessibilityRole="button" accessibilityLabel={t('picker.select', { name: provider.name })} accessibilityState={{ selected: provider.id === selectedId, disabled: !provider.hasCredential }} disabled={!provider.hasCredential}
        onPress={() => { setOpen(false); if (provider.id !== selectedId) onSelect(provider.id); }}
        style={({ pressed }) => ({ borderWidth: theme.borderWidths.default, borderColor: provider.id === selectedId ? theme.colors.primary : theme.colors.separator, borderRadius: theme.borderRadii.lg, backgroundColor: pressed ? theme.colors.surfaceMuted : provider.id === selectedId ? theme.colors.surfaceSelected : theme.colors.surface, padding: theme.spacing[4], gap: theme.spacing[1] })}>
        <Inline><Text variant="label" style={{ flex: 1 }}>{provider.name}</Text>{provider.id === selectedId ? <Check size={theme.controlSizes.icon} color={theme.colors.ink} /> : null}</Inline>
        <Text variant="caption">{provider.model} · {provider.visibility === 'private' ? t('picker.private') : provider.ownedByMe ? t('picker.sharedByMe') : t('picker.sharedByFamily')}</Text>
        <Text variant="caption">{provider.baseUrl}</Text>
        {provider.hasCredential ? null : <Text variant="caption" color="destructive">{provider.ownedByMe ? t('picker.missingOwnKey') : t('picker.missingSharedKey')}</Text>}
      </Pressable>)}
      <MenuRow label={t('models.title')} icon={Settings} opensPage onPress={() => { setOpen(false); router.push(`${assistantPath(householdId)}/providers`); }} />
      <Text variant="caption">{t('picker.privacy')}</Text>
    </Stack></AppDialog> : null}
  </>;
}
