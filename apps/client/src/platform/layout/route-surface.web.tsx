import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useGlobalSearchParams, useIsFocused, useLocalSearchParams, usePathname } from 'expo-router';
import { View, useWindowDimensions } from 'react-native';
import { theme } from '../../ui/theme';

/** The web native-stack hides retained screens from AT and its outer screen
 * catches pointers. Adapt that owned surface while resource panes are open;
 * keep the navigator, route history and beforeRemove listeners intact. */
export function RouteSurface({ children }: { children: ReactNode }) {
  const ref = useRef<View>(null);
  const path = usePathname();
  const localId = useLocalSearchParams<{ id?: string }>().id;
  const activeId = useGlobalSearchParams<{ id?: string }>().id;
  const sameHousehold = localId === activeId;
  const focused = useIsFocused();
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  const desktop = useWindowDimensions().width >= theme.layout.navigationBreakpoint;
  const pane = desktop && /\/(tasks|events|notes|recurrence-rules)\/[^/]+(?:\/edit)?$/.test(path);
  useLayoutEffect(() => {
    if (!pane) return;
    const root = ref.current as unknown as HTMLElement | null;
    // Focused screens omit aria-hidden entirely. The first absolutely placed
    // ancestor is native-stack's Screen (its full-viewport surface).
    let screen = root?.parentElement ?? null;
    while (screen && getComputedStyle(screen).position !== 'absolute') screen = screen.parentElement;
    if (!root || !screen) return;
    const elements: HTMLElement[] = [];
    for (let node: HTMLElement | null = root; node; node = node.parentElement) {
      elements.push(node);
      if (node === screen) break;
    }
    const saved = elements.map(node => node.style.pointerEvents);
    elements.forEach(node => { node.style.pointerEvents = 'none'; });
    // Only the visible retained list and focused pane participate in reading order.
    const sync = () => { if (sameHousehold && screen.style.display !== 'none' && screen.hasAttribute('aria-hidden')) screen.removeAttribute('aria-hidden'); };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(screen, { attributes: true, attributeFilter: ['aria-hidden', 'style'] });
    return () => {
      observer.disconnect();
      elements.forEach((node, index) => { node.style.pointerEvents = saved[index] ?? ''; });
      screen.setAttribute('aria-hidden', String(!focusedRef.current));
    };
  }, [pane, path, sameHousehold]);
  return <View ref={ref} pointerEvents={pane ? 'box-none' : 'auto'} style={{ flex: 1 }}>{children}</View>;
}
