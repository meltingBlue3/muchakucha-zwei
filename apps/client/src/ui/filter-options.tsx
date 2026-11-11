import { useTheme } from '@shopify/restyle';
import { Pressable, View } from 'react-native';
import { Stack, Text } from './primitives';
import type { Theme } from './theme';
import { useDesktopDensity } from './use-desktop';

/** `hideLabel` keeps the group's accessible name while dropping the visible title, for a row whose meaning the page already shows. */
export function FilterOptions({ label, hideLabel = false, options, value, onChange }: { label: string; hideLabel?: boolean; options: Array<{ value: string; label: string; name: string }>; value: string; onChange(value: string): void }) {
  const theme = useTheme<Theme>();
  const dense = useDesktopDensity();
  // Compact pills keep a full-height touch target through hit slop; the row gap
  // is at least the two slops, so wrapped rows never share a tap.
  const slop = dense ? 0 : (theme.controlSizes.touchTarget - theme.controlSizes.compact) / 2;
  return <Stack gap={1}>
    {hideLabel ? null : <Text variant="label">{label}</Text>}
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: dense ? 0 : theme.spacing[2], rowGap: slop * 2, ...(dense ? { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.borderRadii.sm, padding: theme.spacing[1] / 2 } : {}) }}>
      {options.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.name} accessibilityState={{ checked: value === option.value }} aria-checked={value === option.value} hitSlop={{ top: slop, bottom: slop }} onPress={() => onChange(option.value)} style={({ pressed }) => ({ minHeight: dense ? theme.layout.desktopControl - theme.spacing[1] : theme.controlSizes.compact, justifyContent: 'center', paddingHorizontal: theme.spacing[3], borderRadius: dense ? theme.borderRadii.sm : theme.borderRadii.full, backgroundColor: value === option.value ? dense ? theme.colors.surface : theme.colors.primary : pressed ? theme.colors.surfaceMuted : dense ? theme.colors.transparent : theme.colors.surface, borderWidth: dense ? 0 : theme.borderWidths.default, borderColor: value === option.value ? theme.colors.primary : theme.colors.outline })}>
        <Text variant="bodySm" color={!dense && value === option.value ? 'surface' : 'ink'}>{option.label}</Text>
      </Pressable>)}
    </View>
  </Stack>;
}
