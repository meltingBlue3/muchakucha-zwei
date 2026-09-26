import { useCallback, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ellipsis from 'lucide-react-native/icons/ellipsis';
import Trash2 from 'lucide-react-native/icons/trash-2';
import { useOverlayFocus } from '../platform/overlays/overlay-focus';
import { Text } from './primitives';
import { theme } from './theme';

export function CardActionsMenu({ label, onPress, disabled = false }: { label: string; onPress(): void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ top: 0, right: theme.layout.mobileInset });
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const trigger = useRef<View>(null);
  const panel = useRef<View>(null);
  const initial = useRef<View>(null);
  const close = useCallback(() => setOpen(false), []);
  const focus = useOverlayFocus({ mode: open ? 'menu' : 'closed', panel, initial, trigger, onClose: close });
  const menuLabel = label.replace(/^删除/, '更多操作：');
  return <>
    <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={menuLabel} accessibilityState={{ disabled, expanded: open }} aria-expanded={open} aria-haspopup="menu" disabled={disabled} onPress={() => {
      trigger.current?.measureInWindow((x, y, w, h) => setAnchor({ top: y + h, right: Math.max(theme.layout.mobileInset, width - x - w) }));
      setOpen(true);
    }} style={({ pressed }) => ({ minWidth: theme.controlSizes.touchTarget, minHeight: theme.controlSizes.touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: theme.borderRadii.full, backgroundColor: pressed || open ? theme.colors.surfaceMuted : theme.colors.transparent })}>
      <Ellipsis size={theme.controlSizes.icon} color={theme.colors.inkMuted} />
    </Pressable>
    {open ? <Modal {...(Platform.OS === 'web' ? { 'aria-label': menuLabel } : {})} transparent visible animationType="none" onShow={focus} onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1 }}>
        <Pressable accessible={false} tabIndex={-1} testID="card-menu-dismiss" onPress={close} style={StyleSheet.absoluteFill} />
        <View ref={panel} accessibilityRole="menu" accessibilityLabel={menuLabel} accessibilityViewIsModal style={{ position: 'absolute', top: Math.max(insets.top, Math.min(anchor.top, height - insets.bottom - theme.controlSizes.touchTarget - theme.spacing[6])), right: anchor.right, minWidth: theme.controlSizes.touchTarget * 3, backgroundColor: theme.colors.surface, padding: theme.spacing[2], borderRadius: theme.borderRadii.md, borderWidth: theme.borderWidths.default, borderColor: theme.colors.separator, boxShadow: theme.shadow.soft }}>
          <Pressable ref={initial} accessibilityRole="menuitem" accessibilityLabel={label} onPress={() => { close(); requestAnimationFrame(onPress); }} style={({ pressed }) => ({ minHeight: theme.controlSizes.touchTarget, flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3], paddingHorizontal: theme.spacing[3], borderRadius: theme.borderRadii.sm, backgroundColor: pressed ? theme.colors.destructiveSoft : theme.colors.surface })}>
            <Trash2 size={theme.controlSizes.icon} color={theme.colors.destructive} /><Text variant="label" color="destructive">删除</Text>
          </Pressable>
        </View>
      </View>
    </Modal> : null}
  </>;
}
