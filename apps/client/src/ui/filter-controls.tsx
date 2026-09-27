import type { Ref } from 'react';
import { Pressable, View } from 'react-native';
import ListFilter from 'lucide-react-native/icons/list-filter';
import { Button, Text } from './primitives';
import { theme } from './theme';

export function FilterButton({ label, count, onPress, ref }: { label: string; count: number; onPress(): void; ref?: Ref<View> }) {
  return <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={`${label}${count ? `，已选择 ${count} 项` : ''}`} aria-haspopup="dialog" onPress={onPress} style={({ pressed }) => ({ minHeight: theme.controlSizes.touchTarget, minWidth: theme.controlSizes.touchTarget, paddingHorizontal: theme.spacing[2], flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2], borderRadius: theme.borderRadii.md, backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.transparent })}>
    <ListFilter size={theme.controlSizes.icon} color={theme.colors.ink} />
    <Text variant="label">筛选{count ? `（${count}）` : ''}</Text>
  </Pressable>;
}

export function FilterActions({ onClear, onDone }: { onClear(): void; onDone(): void }) {
  return <View style={{ flexDirection: 'row', gap: theme.spacing[3] }}>
    <View style={{ flex: 1 }}><Button label="清除" tone="secondary" onPress={onClear} /></View>
    <View style={{ flex: 2 }}><Button label="完成" onPress={onDone} /></View>
  </View>;
}
