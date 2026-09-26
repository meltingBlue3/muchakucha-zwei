import { useTheme } from '@shopify/restyle';
import { Pressable, View } from 'react-native';
import { Stack, Text } from './primitives';
import type { Theme } from './theme';

export function FilterOptions({ label, options, value, onChange }: { label: string; options: Array<{ value: string; label: string; name: string }>; value: string; onChange(value: string): void }) {
  const theme = useTheme<Theme>();
  return <Stack gap={1}>
    {label !== '任务状态' ? <Text variant="label">{label}</Text> : null}
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[2] }}>
      {options.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.name} accessibilityState={{ checked: value === option.value }} aria-checked={value === option.value} onPress={() => onChange(option.value)} style={({ pressed }) => ({ minHeight: theme.controlSizes.touchTarget, justifyContent: 'center', paddingHorizontal: theme.spacing[3], borderRadius: theme.borderRadii.full, backgroundColor: value === option.value ? theme.colors.coral : pressed ? theme.colors.surfaceMuted : theme.colors.surface, borderWidth: theme.borderWidths.default, borderColor: value === option.value ? theme.colors.coral : theme.colors.separator })}>
        <Text variant="bodySm" color={value === option.value ? 'surface' : 'ink'}>{option.label}</Text>
      </Pressable>)}
    </View>
  </Stack>;
}
