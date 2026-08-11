import { Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import type { LabelResponseDto } from '@muchakucha/api-client';
import X from 'lucide-react-native/icons/x';
import type { Theme } from '../../ui/theme';
import { Text } from '../../ui/primitives';

/** Map a label color hex to a light background variant for the chip. */
function lightenColor(hex: string): string {
  // Simple approach: return a very light version
  return hex + '22'; // Add 13% alpha
}

interface LabelChipProps {
  label: LabelResponseDto;
  onRemove?: (label: LabelResponseDto) => void;
  small?: boolean;
}

export function LabelChip({ label, onRemove, small = false }: LabelChipProps) {
  const activeTheme = useTheme<Theme>();

  return (
    <View
      accessibilityLabel={`标签：${label.name}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: activeTheme.spacing[1],
        backgroundColor: lightenColor(label.color),
        borderWidth: 1,
        borderColor: label.color,
        borderRadius: activeTheme.borderRadii.full,
        paddingHorizontal: small ? activeTheme.spacing[2] : activeTheme.spacing[3],
        paddingVertical: small ? 2 : activeTheme.spacing[1],
      }}
    >
      <View
        style={{
          width: small ? 8 : 10,
          height: small ? 8 : 10,
          borderRadius: activeTheme.borderRadii.full,
          backgroundColor: label.color,
        }}
      />
      <Text variant={small ? 'caption' : 'bodySm'} style={{ color: label.color }}>
        {label.name}
      </Text>
      {onRemove !== undefined && (
        <Pressable
          onPress={() => onRemove(label)}
          hitSlop={activeTheme.spacing[2]}
          accessibilityLabel={`移除标签 ${label.name}`}
          style={{ marginLeft: activeTheme.spacing[1] }}
        >
          <X size={14} color={label.color} strokeWidth={2} />
        </Pressable>
      )}
    </View>
  );
}
