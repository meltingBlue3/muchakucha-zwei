import { useCallback, useRef, useState } from 'react';
import { Modal, Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Plus from 'lucide-react-native/icons/plus';
import X from 'lucide-react-native/icons/x';
import Calendar from 'lucide-react-native/icons/calendar';
import ListTodo from 'lucide-react-native/icons/list-todo';
import FileText from 'lucide-react-native/icons/file-text';
import { useOverlayFocus } from '../platform/overlays/overlay-focus';
import { DialogBackdrop } from './dialog-backdrop';
import { Button, Text } from './primitives';
import { theme } from './theme';

type CreateAction = { kind: 'events' | 'tasks' | 'notes'; label: string; onPress(): void };
const icons = { events: Calendar, tasks: ListTodo, notes: FileText };
type Props = { label: string; onPress(): void; actions?: never } | { label?: never; onPress?: never; actions: CreateAction[] };

export function FloatingCreateButton(props: Props) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ right: theme.layout.mobileInset, bottom: theme.spacing[4], top: theme.spacing[4] });
  const { width, height } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= theme.layout.navigationBreakpoint;
  const insets = useSafeAreaInsets();
  const trigger = useRef<View>(null);
  const panel = useRef<View>(null);
  const initial = useRef<View>(null);
  const close = useCallback(() => setOpen(false), []);
  const focus = useOverlayFocus({ mode: open ? 'menu' : 'closed', panel, initial, trigger, onClose: close });
  const buttonStyle = { width: theme.spacing[16], height: theme.spacing[16], borderRadius: theme.borderRadii.full, backgroundColor: theme.colors.coral, alignItems: 'center' as const, justifyContent: 'center' as const, boxShadow: theme.shadow.soft };
  const openCreate = () => {
    if (!props.actions) { props.onPress(); return; }
    trigger.current?.measureInWindow((x, y, w, h) => setAnchor({ right: Math.max(theme.spacing[4], width - x - w), bottom: Math.max(insets.bottom + theme.spacing[4], height - y - h), top: y + h + theme.spacing[2] }));
    setOpen(true);
  };
  return <>
    {desktop ? <Button ref={trigger} testID="header-create" label={props.label ?? '创建'} accessibilityLabel={props.label ?? '创建新内容'} aria-haspopup={props.actions ? 'menu' : undefined} {...(props.actions ? { expanded: open } : {})} onPress={openCreate} /> : <Pressable ref={trigger} testID="floating-create" accessibilityRole="button" accessibilityLabel={props.label ?? '创建新内容'} aria-haspopup={props.actions ? 'menu' : undefined} aria-{...(props.actions ? { expanded: open } : {})} accessibilityState={props.actions ? { expanded: open } : {}} onPress={openCreate} style={({ pressed }) => [buttonStyle, { backgroundColor: pressed ? theme.colors.coralPressed : theme.colors.coral }]}>
      <Plus size={theme.spacing[8]} color={theme.colors.surface} />
    </Pressable>}
    {open && props.actions ? <Modal {...(Platform.OS === 'web' ? { 'aria-label': '创建选项' } : {})} transparent visible animationType="none" onShow={focus} onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1 }}>
        <DialogBackdrop testID="create-menu" onPress={close} />
        <View ref={panel} accessibilityRole="menu" accessibilityLabel="创建内容" accessibilityViewIsModal style={{ position: 'absolute', right: anchor.right, ...(desktop ? { top: anchor.top } : { bottom: anchor.bottom }), gap: theme.spacing[3], alignItems: 'flex-end', maxWidth: width - theme.layout.mobileInset * 2 }}>
          {props.actions.map(({ kind, label, onPress }, index) => {
            const Icon = icons[kind];
            return <Pressable key={kind} ref={index === 0 ? initial : undefined} accessibilityRole="menuitem" accessibilityLabel={label} onPress={() => { close(); requestAnimationFrame(onPress); }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', minHeight: theme.controlSizes.primary, paddingHorizontal: theme.spacing[6], paddingVertical: theme.spacing[3], gap: theme.spacing[3], backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.coralSoft, borderRadius: theme.borderRadii.full })}>
              <Icon color={theme.colors.coral} size={theme.controlSizes.icon} /><Text variant="button" color="link">{label}</Text>
            </Pressable>;
          })}
          {!desktop ? <Pressable accessibilityRole="menuitem" accessibilityLabel="关闭创建菜单" onPress={close} style={buttonStyle}><X size={theme.spacing[8]} color={theme.colors.surface} /></Pressable> : null}
        </View>
      </View>
    </Modal> : null}
  </>;
}
