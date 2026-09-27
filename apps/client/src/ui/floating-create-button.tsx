import { useCallback, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Plus from 'lucide-react-native/icons/plus';
import X from 'lucide-react-native/icons/x';
import Calendar from 'lucide-react-native/icons/calendar';
import ListTodo from 'lucide-react-native/icons/list-todo';
import FileText from 'lucide-react-native/icons/file-text';
import { useOverlayFocus } from '../platform/overlays/overlay-focus';
import { Text } from './primitives';
import { theme } from './theme';

type CreateAction = { kind: 'events' | 'tasks' | 'notes'; label: string; onPress(): void };
const icons = { events: Calendar, tasks: ListTodo, notes: FileText };
type Props = { label: string; onPress(): void; actions?: never } | { label?: never; onPress?: never; actions: CreateAction[] };

export function FloatingCreateButton(props: Props) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ right: theme.layout.mobileInset, bottom: theme.spacing[4] });
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const trigger = useRef<View>(null);
  const panel = useRef<View>(null);
  const initial = useRef<View>(null);
  const close = useCallback(() => setOpen(false), []);
  const focus = useOverlayFocus({ mode: open ? 'menu' : 'closed', panel, initial, trigger, onClose: close });
  const buttonStyle = { width: theme.spacing[16], height: theme.spacing[16], borderRadius: theme.borderRadii.full, backgroundColor: theme.colors.coral, alignItems: 'center' as const, justifyContent: 'center' as const, boxShadow: theme.shadow.soft };
  return <>
    <Pressable ref={trigger} testID="floating-create" accessibilityRole="button" accessibilityLabel={props.label ?? '创建新内容'} aria-haspopup={props.actions ? 'menu' : undefined} aria-expanded={props.actions ? open : undefined} accessibilityState={props.actions ? { expanded: open } : {}} onPress={() => {
      if (!props.actions) { props.onPress(); return; }
      trigger.current?.measureInWindow((x, y, w, h) => setAnchor({ right: Math.max(theme.spacing[4], width - x - w), bottom: Math.max(insets.bottom + theme.spacing[4], height - y - h) }));
      setOpen(true);
    }} style={({ pressed }) => [buttonStyle, { opacity: pressed ? 0.8 : 1 }]}>
      <Plus size={theme.spacing[8]} color={theme.colors.surface} />
    </Pressable>
    {open && props.actions ? <Modal {...(Platform.OS === 'web' ? { 'aria-label': '创建选项' } : {})} transparent visible animationType="none" onShow={focus} onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1 }}>
        <Pressable testID="create-menu-dismiss" accessible={false} tabIndex={-1} onPress={close} style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.canvas, opacity: 0.94 }]} />
        <View ref={panel} accessibilityRole="menu" accessibilityLabel="创建内容" accessibilityViewIsModal style={{ position: 'absolute', right: anchor.right, bottom: anchor.bottom, gap: theme.spacing[3], alignItems: 'flex-end', maxWidth: width - theme.layout.mobileInset * 2 }}>
          {props.actions.map(({ kind, label, onPress }, index) => {
            const Icon = icons[kind];
            return <Pressable key={kind} ref={index === 0 ? initial : undefined} accessibilityRole="menuitem" accessibilityLabel={label} onPress={() => { close(); requestAnimationFrame(onPress); }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', minHeight: theme.controlSizes.primary, paddingHorizontal: theme.spacing[6], paddingVertical: theme.spacing[3], gap: theme.spacing[3], backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.coralSoft, borderRadius: theme.borderRadii.full })}>
              <Icon color={theme.colors.coral} size={theme.controlSizes.icon} /><Text variant="button" color="link">{label}</Text>
            </Pressable>;
          })}
          <Pressable accessibilityRole="menuitem" accessibilityLabel="关闭创建菜单" onPress={close} style={buttonStyle}><X size={theme.spacing[8]} color={theme.colors.surface} /></Pressable>
        </View>
      </View>
    </Modal> : null}
  </>;
}
