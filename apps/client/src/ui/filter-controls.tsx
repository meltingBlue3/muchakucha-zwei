import type { Ref } from 'react';
import { Pressable, View } from 'react-native';
import ListFilter from 'lucide-react-native/icons/list-filter';
import { Button, Text } from './primitives';
import { theme } from './theme';
import { useTranslation } from '../i18n';

export function FilterButton({ label, count, onPress, ref }: { label: string; count: number; onPress(): void; ref?: Ref<View> }) {
  const { t } = useTranslation('shared');
  return <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={count ? t('filterSelected', { label, count }) : label} aria-haspopup="dialog" onPress={onPress} style={({ pressed }) => ({ minHeight: theme.controlSizes.touchTarget, minWidth: theme.controlSizes.touchTarget, paddingHorizontal: theme.spacing[3], flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2], borderRadius: theme.borderRadii.full, backgroundColor: pressed ? theme.colors.surfaceMuted : count ? theme.colors.surface : theme.colors.transparent })}>
    <ListFilter size={theme.controlSizes.icon} color={count ? theme.colors.ink : theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />
    <Text variant="label" color={count ? 'ink' : 'inkMuted'}>{count ? t('filterCount', { count }) : t('filter')}</Text>
  </Pressable>;
}

export function FilterActions({ onClear, onDone }: { onClear(): void; onDone(): void }) {
  const { t } = useTranslation('common');
  return <View style={{ flexDirection: 'row', gap: theme.spacing[3] }}>
    <View style={{ flex: 1 }}><Button label={t('clear')} tone="secondary" onPress={onClear} /></View>
    <View style={{ flex: 2 }}><Button label={t('done')} onPress={onDone} /></View>
  </View>;
}
