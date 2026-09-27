import { View } from 'react-native';
import Check from 'lucide-react-native/icons/check';
import { useTheme } from '@shopify/restyle';
import type { LabelResponseDto } from '@muchakucha/api-client';
import type { Theme } from '../../ui/theme';
import { Text } from '../../ui/primitives';

/** A faint wash of the label's own color for the chip background. */
function tint(hex: string): string {
  return hex + '1F'; // about 12% alpha
}

interface LabelChipProps {
  label: LabelResponseDto;
  small?: boolean;
  /** Set in a picker: unselected chips are plain outlines, selected ones filled and checked. */
  selected?: boolean;
}

/**
 * Labels carry arbitrary member-chosen colors, so the color lives in the dot,
 * wash and outline while the name stays in ink: light presets such as yellow
 * would otherwise be unreadable as text.
 */
export function LabelChip({ label, small = false, selected }: LabelChipProps) {
  const unselected = selected === false;
  const activeTheme = useTheme<Theme>();
  const dot = small ? activeTheme.spacing[2] : activeTheme.spacing[2] + activeTheme.spacing[1] / 2;

  return (
    <View
      accessibilityLabel={`标签：${label.name}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: activeTheme.spacing[1],
        backgroundColor: unselected ? activeTheme.colors.surface : tint(label.color),
        borderWidth: activeTheme.borderWidths.default,
        borderColor: unselected ? activeTheme.colors.border : label.color,
        borderRadius: activeTheme.borderRadii.full,
        paddingHorizontal: small ? activeTheme.spacing[2] : activeTheme.spacing[3],
        paddingVertical: small ? activeTheme.spacing[1] / 2 : activeTheme.spacing[1],
      }}
    >
      {selected ? (
        <Check size={dot + activeTheme.spacing[1]} color={activeTheme.colors.ink} strokeWidth={activeTheme.controlSizes.iconStroke} />
      ) : (
        <View style={{ width: dot, height: dot, borderRadius: activeTheme.borderRadii.full, backgroundColor: label.color }} />
      )}
      <Text variant={small ? 'caption' : 'bodySm'} color="ink">
        {label.name}
      </Text>
    </View>
  );
}
