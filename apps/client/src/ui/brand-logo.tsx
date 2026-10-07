import { Text, View } from 'react-native';

import { theme } from './theme';

/**
 * The brand seal: 「家」 in white on vermilion, like a name stamp pressed into
 * a family notebook. Decorative; the product name beside it is the label.
 */
export const BrandLogo = () => (
  <View
    accessible={false}
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
    style={{
      width: theme.controlSizes.avatar,
      height: theme.controlSizes.avatar,
      borderRadius: theme.borderRadii.sm,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      transform: [{ rotate: '-4deg' }],
    }}
  >
    <Text
      allowFontScaling={false}
      style={{
        color: theme.colors.surface,
        fontFamily: theme.fontFamilies.semibold,
        fontSize: theme.typography.section.fontSize,
        fontWeight: '700',
        lineHeight: theme.typography.section.lineHeight - theme.spacing[1],
      }}
    >
      家
    </Text>
  </View>
);
