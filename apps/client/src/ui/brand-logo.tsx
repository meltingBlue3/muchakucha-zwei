import { Image } from 'react-native';

import { theme } from './theme';

/** The compact, decorative graphic used beside the product name. */
export const BrandLogo = () => (
  <Image
    accessible={false}
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
    resizeMode="contain"
    source={require('../../assets/images/brand-mark.png')}
    style={{ height: theme.spacing[6], width: theme.spacing[10] }}
  />
);
