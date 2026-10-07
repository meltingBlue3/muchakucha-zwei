import type { ComponentType } from 'react';
import { Pressable } from 'react-native';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import { Text } from '../../ui/primitives';
import { theme } from '../../ui/theme';

/**
 * One action in a phone sheet, drawn like the household menu's links: an icon,
 * the name and, for a page it opens, a chevron. A list of these reads as a menu
 * where a stack of full-width buttons would read as a form.
 */
export function MenuRow({ label, icon: Icon, onPress, opensPage = false, destructive = false, disabled = false }: {
  label: string; icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>; onPress(): void;
  opensPage?: boolean; destructive?: boolean; disabled?: boolean;
}) {
  // The row bleeds into the sheet's padding so the icon lines up with the sheet title.
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3], minHeight: theme.controlSizes.touchTarget, paddingHorizontal: theme.spacing[2], marginHorizontal: -theme.spacing[2], borderRadius: theme.borderRadii.md, backgroundColor: pressed ? destructive ? theme.colors.destructiveSoft : theme.colors.surfaceMuted : theme.colors.transparent })}>
    <Icon size={theme.controlSizes.icon} color={destructive && !disabled ? theme.colors.destructive : theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />
    <Text color={disabled ? 'inkMuted' : destructive ? 'destructive' : 'ink'} style={{ flex: 1 }}>{label}</Text>
    {opensPage ? <ChevronRight size={theme.controlSizes.icon} color={theme.colors.inkFaint} strokeWidth={theme.controlSizes.iconStroke} /> : null}
  </Pressable>;
}
