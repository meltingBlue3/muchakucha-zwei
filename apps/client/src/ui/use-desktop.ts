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

/**
 * A note opened beside Today takes the room of 待办 and 接下来, so it is
 * written at about reading width, while the timeline keeps at least 320.
 */
export function todayNotePaneWidth(width: number, rail: boolean) {
  const workspace = width - (rail ? theme.layout.railWidth : theme.layout.navigationWidth) - theme.layout.workspaceInset - theme.borderWidths.default * 2;
  return Math.max(desktopDetailWidth(width), Math.min(theme.layout.todayTodoWidth + theme.layout.todayUpcomingWidth, workspace - theme.layout.todayTimelineMinWidth));
}

export function desktopDetailWidth(width: number) {
  if (width < theme.layout.railBreakpoint) return theme.layout.detailPaneWidthCompact;
  return Math.min(theme.layout.detailPaneWidthMax, theme.layout.detailPaneWidth + Math.max(0, width - theme.layout.detailGrowthBreakpoint) / 2);
}
