import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from './primitives';
import { theme } from './theme';

/** How a household is told apart in the 总览: the first character of its name, in its own color. */
export interface HouseholdMark {
  character: string;
  color: string;
  name: string;
}

const sizes = {
  sm: { box: 16, font: 10, radius: 4 },
  md: { box: 18, font: 11, radius: 4 },
  lg: { box: 28, font: 14, radius: 6 },
} as const;

/**
 * A household's square seal: the first character of its name, outlined in the
 * household's color. With `named` it is read out as the household's name;
 * otherwise it is decoration beside text that already names it.
 */
export function HouseholdSeal({ character, color, name, size = 'md', named = false, style }: {
  character: string;
  color: string;
  name: string;
  size?: keyof typeof sizes;
  named?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { box, font, radius } = sizes[size];
  return (
    <View
      {...(named ? { accessibilityRole: 'image' as const, accessibilityLabel: name } : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const, 'aria-hidden': true })}
      style={[{ width: box, height: box, borderRadius: radius, borderWidth: 1.5, borderColor: color, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, style]}
    >
      <Text style={{ color, fontSize: font, lineHeight: font + 2, fontWeight: '600' }} allowFontScaling={false}>{character}</Text>
    </View>
  );
}

/** Two or more seals overlapping, as the 总览 shows itself in the switch. */
export function SealStack({ marks, size = 'md' }: { marks: ReadonlyArray<{ character: string; color: string; name: string }>; size?: keyof typeof sizes }) {
  const shown = marks.slice(0, 3);
  return (
    <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row' }}>
      {shown.map((mark, index) => (
        <HouseholdSeal key={`${mark.name}-${index}`} {...mark} size={size} style={index > 0 ? { marginLeft: -sizes[size].box / 4 } : undefined} />
      ))}
    </View>
  );
}
