import { useTheme } from '@shopify/restyle';
import Repeat from 'lucide-react-native/icons/repeat';
import { View } from 'react-native';

import type { Theme } from '../../ui/theme';

export function RecurrenceBadge() {
  const activeTheme = useTheme<Theme>();

  return (
    <View accessible accessibilityLabel="重复">
      <Repeat color={activeTheme.colors.inkMuted} size={14} strokeWidth={2} />
    </View>
  );
}
