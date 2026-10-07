import { useTheme } from '@shopify/restyle';
import { StatusBar } from 'react-native';

import type { Theme } from './theme';

/** Keeps native status-bar content legible against the active app theme. */
export const AppStatusBar = () => {
  const activeTheme = useTheme<Theme>();

  return (
    <StatusBar
      barStyle={activeTheme.colorScheme === 'dark' ? 'light-content' : 'dark-content'}
    />
  );
};
