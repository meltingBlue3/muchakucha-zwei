import { Platform, useWindowDimensions } from 'react-native';
import { usePointerDensity } from '../platform/layout/pointer-density';
import { theme } from './theme';

export function useDesktop() {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= theme.layout.navigationBreakpoint;
}

export function useDesktopDensity() {
  const desktop = useDesktop();
  return usePointerDensity() && desktop;
}

export function desktopDetailWidth(width: number) {
  if (width < theme.layout.railBreakpoint) return theme.layout.detailPaneWidthCompact;
  return Math.min(theme.layout.detailPaneWidthMax, theme.layout.detailPaneWidth + Math.max(0, width - theme.layout.detailGrowthBreakpoint) / 2);
}
