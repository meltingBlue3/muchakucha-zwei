import { useTheme } from '@shopify/restyle';
import { Pressable, View } from 'react-native';
import { Stack, Text } from './primitives';
import type { Theme } from './theme';

/** `hideLabel` keeps the group's accessible name while dropping the visible title, for a row whose meaning the page already shows. */
export function FilterOptions({ label, hideLabel = false, options, value, onChange }: { label: string; hideLabel?: boolean; options: Array<{ value: string; label: string; name: string }>; value: string; onChange(value: string): void }) {
  const theme = useTheme<Theme>();
  return <Stack gap={1}>
    {hideLabel ? null : <Text variant="label">{label}</Text>}
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[2] }}>
      {options.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.name} accessibilityState={{ checked: value === option.value }} aria-checked={value === option.value} onPress={() => onChange(option.value)} style={({ pressed }) => ({ minHeight: theme.controlSizes.touchTarget, justifyContent: 'center', paddingHorizontal: theme.spacing[3], borderRadius: theme.borderRadii.full, backgroundColor: value === option.value ? theme.colors.coral : pressed ? theme.colors.surfaceMuted : theme.colors.surface, borderWidth: theme.borderWidths.default, borderColor: value === option.value ? theme.colors.coral : theme.colors.separator })}>
        <Text variant="bodySm" color={value === option.value ? 'surface' : 'ink'}>{option.label}</Text>
      </Pressable>)}
    </View>
  </Stack>;
}
