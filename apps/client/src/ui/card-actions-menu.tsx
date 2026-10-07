import { useCallback, useRef, useState, type ComponentType } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ellipsis from 'lucide-react-native/icons/ellipsis';
import Pencil from 'lucide-react-native/icons/pencil';
import Trash2 from 'lucide-react-native/icons/trash-2';
import { useOverlayFocus } from '../platform/overlays/overlay-focus';
import { Text } from './primitives';
import { theme } from './theme';

type ActionIcon = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
interface ActionLook { label: string; icon: ActionIcon; destructive?: boolean }

/**
 * One menu item: `kind` picks the standard 编辑 or 删除, otherwise the item
 * brings its own label and icon, such as 「移除」 on a member.
 */
export type CardAction = ({ kind: 'edit' | 'delete' } | ({ kind?: undefined } & ActionLook)) & {
  /** Full name for assistive technology, such as "删除任务：买菜". */
  accessibilityLabel: string;
  /** Receives the menu trigger, so a window opened from the item can return focus to it. */
  onPress(trigger: View | null): void;
};

const STANDARD_LOOK: Record<'edit' | 'delete', ActionLook> = {
  edit: { label: '编辑', icon: Pencil },
  delete: { label: '删除', icon: Trash2, destructive: true },
};

/**
 * The "…" menu on a card or list row. `subject` names the item ("任务：买菜")
 * and titles the trigger "更多操作：任务：买菜". Renders nothing without actions.
 */
export function CardActionsMenu(props: { subject: string; actions: CardAction[]; disabled?: boolean }) {
  return props.actions.length === 0 ? null : <ActionsMenu {...props} />;
}

function ActionsMenu({ subject, actions, disabled = false }: { subject: string; actions: CardAction[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ top: 0, right: theme.layout.mobileInset });
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const trigger = useRef<View>(null);
  const panel = useRef<View>(null);
  const initial = useRef<View>(null);
  const close = useCallback(() => setOpen(false), []);
  const focus = useOverlayFocus({ mode: open ? 'menu' : 'closed', panel, initial, trigger, onClose: close });
  const menuLabel = `更多操作：${subject}`;
  const panelHeight = actions.length * theme.controlSizes.touchTarget + theme.spacing[4];
  return <>
    <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={menuLabel} accessibilityState={{ disabled, expanded: open }} aria-expanded={open} aria-haspopup="menu" disabled={disabled} onPress={() => {
      trigger.current?.measureInWindow((x, y, w, h) => setAnchor({ top: y + h, right: Math.max(theme.layout.mobileInset, width - x - w) }));
      setOpen(true);
    }} style={({ pressed }) => ({ minWidth: theme.controlSizes.touchTarget, minHeight: theme.controlSizes.touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: theme.borderRadii.full, backgroundColor: pressed || open ? theme.colors.surfaceMuted : theme.colors.transparent })}>
      <Ellipsis size={theme.controlSizes.icon} color={theme.colors.inkFaint} strokeWidth={theme.controlSizes.iconStroke} />
    </Pressable>
    {open ? <Modal {...(Platform.OS === 'web' ? { 'aria-label': menuLabel } : {})} transparent visible animationType="none" onShow={focus} onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1 }}>
        <Pressable accessible={false} tabIndex={-1} testID="card-menu-dismiss" onPress={close} style={StyleSheet.absoluteFill} />
        <View ref={panel} accessibilityRole="menu" accessibilityLabel={menuLabel} accessibilityViewIsModal style={{ position: 'absolute', top: Math.max(insets.top, Math.min(anchor.top, height - insets.bottom - panelHeight - theme.spacing[2])), right: anchor.right, minWidth: theme.controlSizes.touchTarget * 3, backgroundColor: theme.colors.surface, padding: theme.spacing[2], borderRadius: theme.borderRadii.lg, borderWidth: theme.borderWidths.default, borderColor: theme.colors.separator, boxShadow: theme.shadow.soft }}>
          {actions.map((action, index) => {
            const { label, icon: Icon, destructive = false } = action.kind ? STANDARD_LOOK[action.kind] : action;
            return (
              <Pressable key={action.accessibilityLabel} ref={index === 0 ? initial : undefined} accessibilityRole="menuitem" accessibilityLabel={action.accessibilityLabel} onPress={() => { close(); requestAnimationFrame(() => action.onPress(trigger.current)); }} style={({ pressed }) => ({ minHeight: theme.controlSizes.touchTarget, flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3], paddingHorizontal: theme.spacing[3], borderRadius: theme.borderRadii.md, backgroundColor: pressed ? (destructive ? theme.colors.destructiveSoft : theme.colors.surfaceMuted) : theme.colors.surface })}>
                <Icon size={theme.controlSizes.icon} color={destructive ? theme.colors.destructive : theme.colors.ink} strokeWidth={theme.controlSizes.iconStroke} />
                <Text variant="label" color={destructive ? 'destructive' : 'ink'}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal> : null}
  </>;
}
