import { createContext, useContext, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode, type RefObject } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Check from 'lucide-react-native/icons/check';
import { MenuLayer } from '../platform/overlays/menu-layer';
import { useOverlayFocus } from '../platform/overlays/overlay-focus';
import { insetFocusRing } from '../platform/focus-ring/focus-ring';
import { Text } from './primitives';
import { theme } from './theme';
import { useDesktopDensity } from './use-desktop';

type MenuIcon = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
type Placement = { top?: number; bottom?: number; left?: number; right?: number; minWidth: number; maxWidth: number; maxHeight: number };

const InitialItem = createContext<RefObject<View | null> | null>(null);

/**
 * A small menu floating by its trigger, over the page rather than in its flow:
 * a transparent layer closes it and nothing is dimmed. It drops below the
 * trigger, or rises above it when the trigger sits in the lower half of the
 * window, and scrolls when the room on that side runs out. On Web the arrow
 * keys move between items and Escape closes it. Render it only while open.
 */
export function AnchoredMenu({ label, trigger, onClose, role = 'menu', align = 'start', dismissTestID, children }: {
  /** Names the menu for assistive technology. */
  label: string;
  trigger: RefObject<View | null>;
  onClose(): void;
  /** `radiogroup` when the items are choices made with `checked`, `menu` when they are actions. */
  role?: 'menu' | 'radiogroup';
  /** Which trigger edge the menu lines up with. */
  align?: 'start' | 'end';
  dismissTestID?: string;
  children: ReactNode;
}) {
  const dense = useDesktopDensity();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const panel = useRef<View>(null);
  const initial = useRef<View>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  useLayoutEffect(() => {
    trigger.current?.measureInWindow((x, y, w, h) => {
      const gap = theme.spacing[1];
      const edge = theme.spacing[2];
      const offset = Math.max(edge, align === 'end' ? width - x - w : x);
      const side = align === 'end' ? { right: offset } : { left: offset };
      // At least as wide as the trigger, never past the far edge of the window.
      const fit = { minWidth: Math.min(Math.max(theme.controlSizes.touchTarget * 3, w), width - offset - edge), maxWidth: width - offset - edge };
      setPlacement(y + h / 2 <= height / 2
        ? { ...side, ...fit, top: y + h + gap, maxHeight: height - insets.bottom - edge - (y + h + gap) }
        : { ...side, ...fit, bottom: height - y + gap, maxHeight: y - gap - insets.top - edge });
    });
  }, [align, trigger, width, height, insets.top, insets.bottom]);
  // The items exist from the first render, so focus and keys can move in before the panel is placed.
  const focus = useOverlayFocus({ mode: 'menu', panel, initial, trigger, onClose });
  return (
    <MenuLayer label={label} trigger={trigger} onShow={focus} onClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable accessible={false} tabIndex={-1} {...(dismissTestID ? { testID: dismissTestID } : {})} onPress={onClose} style={StyleSheet.absoluteFill} />
        {/* Unseen until the trigger is measured, so it never flashes in the wrong place. */}
        <View ref={panel} accessibilityRole={role} accessibilityLabel={label} accessibilityViewIsModal style={{ position: 'absolute', ...(placement ?? { top: 0, left: 0, maxHeight: height }), opacity: placement ? 1 : 0, backgroundColor: theme.colors.surface, padding: dense ? theme.spacing[1] + 2 : theme.spacing[2], borderRadius: theme.borderRadii.lg, borderWidth: theme.borderWidths.default, borderColor: theme.colors.separator, boxShadow: theme.shadow.soft }}>
          <InitialItem.Provider value={initial}>
            <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          </InitialItem.Provider>
        </View>
      </View>
    </MenuLayer>
  );
}

/**
 * One row of an `AnchoredMenu`. An action reads in label weight; with
 * `checked` the row is a choice instead, in body weight, ticked when chosen.
 */
export function MenuItem({ label, accessibilityLabel, icon: Icon, leading, checked, destructive = false, initial = false, onPress }: {
  label: string;
  /** The full name when the visible label alone is not, such as 「删除任务：买菜」. */
  accessibilityLabel?: string;
  icon?: MenuIcon;
  /** Decoration before the label when an icon will not do, such as a household seal. */
  leading?: ReactNode;
  checked?: boolean;
  destructive?: boolean;
  /** Takes focus when the menu opens: the first action, or the current choice. */
  initial?: boolean;
  onPress(): void;
}) {
  const dense = useDesktopDensity();
  const initialRef = useContext(InitialItem);
  const choice = checked !== undefined;
  const color = destructive ? theme.colors.destructive : theme.colors.ink;
  return (
    <Pressable
      {...insetFocusRing}
      ref={initial ? initialRef : undefined}
      accessibilityRole={choice ? 'radio' : 'menuitem'}
      accessibilityLabel={accessibilityLabel ?? label}
      {...(choice ? { accessibilityState: { checked }, 'aria-checked': checked } : {})}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ minHeight: dense ? theme.layout.desktopControl : theme.controlSizes.touchTarget, flexDirection: 'row', alignItems: 'center', gap: dense ? theme.spacing[2] + 2 : theme.spacing[3], paddingHorizontal: dense ? theme.spacing[2] + 2 : theme.spacing[3], borderRadius: theme.borderRadii.md, backgroundColor: pressed && destructive ? theme.colors.destructiveSoft : pressed || hovered ? theme.colors.surfaceMuted : theme.colors.surface })}
    >
      {Icon ? <Icon size={dense ? theme.controlSizes.icon - 4 : theme.controlSizes.icon} color={color} strokeWidth={theme.controlSizes.iconStroke} /> : leading}
      {choice
        ? <Text variant={dense ? 'bodySm' : 'body'} color="ink" numberOfLines={1} style={{ flex: 1 }}>{label}</Text>
        : <Text variant="label" color={destructive ? 'destructive' : 'ink'}>{label}</Text>}
      {checked ? <Check size={dense ? theme.controlSizes.icon - 4 : theme.controlSizes.icon - 2} color={theme.colors.ink} strokeWidth={theme.focus.width} /> : null}
    </Pressable>
  );
}
