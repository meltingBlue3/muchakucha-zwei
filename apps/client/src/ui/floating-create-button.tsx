import { useCallback, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Plus from 'lucide-react-native/icons/plus';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import X from 'lucide-react-native/icons/x';
import Cake from 'lucide-react-native/icons/cake';
import CalendarDays from 'lucide-react-native/icons/calendar-days';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import NotebookText from 'lucide-react-native/icons/notebook-text';
import { useOverlayFocus } from '../platform/overlays/overlay-focus';
import { DialogBackdrop } from './dialog-backdrop';
import { Button, Text } from './primitives';
import { theme } from './theme';
import { useTranslation } from '../i18n';

type CreateAction = { kind: 'events' | 'tasks' | 'notes' | 'birthdays'; label: string; onPress(): void };
const icons = { events: CalendarDays, tasks: CircleCheck, notes: NotebookText, birthdays: Cake };
type Props = { label: string; onPress(): void; actions?: never } | { label?: never; onPress?: never; actions: CreateAction[] };

export function FloatingCreateButton(props: Props) {
  const { t } = useTranslation('shared');
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
  const buttonStyle = { width: theme.controlSizes.fab, height: theme.controlSizes.fab, borderRadius: theme.borderRadii.lg + theme.spacing[1] / 2, backgroundColor: theme.colors.primary, alignItems: 'center' as const, justifyContent: 'center' as const, boxShadow: theme.shadow.raised };
  const openCreate = () => {
    if (!props.actions) { props.onPress(); return; }
    trigger.current?.measureInWindow((x, y, w, h) => setAnchor({ right: Math.max(desktop ? 0 : theme.spacing[4], width - x - w), bottom: Math.max(insets.bottom + theme.spacing[4], height - y - h), top: y + h + theme.spacing[2] }));
    setOpen(true);
  };
  return <>
    {desktop ? <Button ref={trigger} testID="header-create" label={props.label ?? t('create')} accessibilityLabel={props.label ?? t('createNewContent')} aria-haspopup={props.actions ? 'menu' : undefined} {...(props.actions ? { expanded: open } : {})} icon={(color) => <Plus size={theme.controlSizes.icon - 4} color={color} strokeWidth={theme.focus.width} />} {...(props.actions ? { trailingIcon: () => <ChevronDown size={theme.controlSizes.icon - 6} color={theme.colors.surface} strokeWidth={theme.focus.width} /> } : {})} onPress={openCreate} /> : <Pressable ref={trigger} testID="floating-create" accessibilityRole="button" accessibilityLabel={props.label ?? t('createNewContent')} aria-haspopup={props.actions ? 'menu' : undefined} aria-{...(props.actions ? { expanded: open } : {})} accessibilityState={props.actions ? { expanded: open } : {}} onPress={openCreate} style={({ pressed }) => [buttonStyle, { backgroundColor: pressed ? theme.colors.primaryPressed : theme.colors.primary }]}>
      <Plus size={theme.spacing[6] + theme.spacing[1]} color={theme.colors.surface} strokeWidth={theme.focus.width} />
    </Pressable>}
    {/* A wide screen anchors a small menu under the button, with no backdrop, like the other desktop menus. */}
    {open && props.actions && desktop ? <Modal {...(Platform.OS === 'web' ? { 'aria-label': t('createOptions') } : {})} transparent visible animationType="none" onShow={focus} onRequestClose={close}>
      <View style={{ flex: 1 }}>
        <Pressable accessible={false} tabIndex={-1} testID="create-menu-dismiss" onPress={close} style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.transparent }]} />
        <View ref={panel} accessibilityRole="menu" accessibilityLabel={t('createContent')} accessibilityViewIsModal style={{ position: 'absolute', right: anchor.right, top: anchor.top, width: theme.layout.createMenuWidth, padding: theme.spacing[1] + 2, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadii.md, borderWidth: theme.borderWidths.default, borderColor: theme.colors.separator, boxShadow: theme.shadow.soft }}>
          {props.actions.map(({ kind, label, onPress }, index) => {
            const Icon = icons[kind];
            return <Pressable key={kind} ref={index === 0 ? initial : undefined} accessibilityRole="menuitem" accessibilityLabel={label} onPress={() => { close(); requestAnimationFrame(onPress); }} style={({ pressed, hovered, focused }: { pressed: boolean; hovered?: boolean; focused?: boolean }) => ({ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[2] + 2, minHeight: theme.layout.desktopNavRow + 2, paddingHorizontal: theme.spacing[2] + 2, borderRadius: theme.borderRadii.sm, backgroundColor: pressed || hovered || focused ? theme.colors.surfaceMuted : theme.colors.transparent })}>
              <Icon color={theme.colors.inkMuted} size={theme.controlSizes.icon - 4} strokeWidth={theme.controlSizes.iconStroke} /><Text variant="bodySm" color="ink">{label}</Text>
            </Pressable>;
          })}
        </View>
      </View>
    </Modal> : null}
    {open && props.actions && !desktop ? <Modal {...(Platform.OS === 'web' ? { 'aria-label': t('createOptions') } : {})} transparent visible animationType="none" onShow={focus} onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1 }}>
        <DialogBackdrop testID="create-menu" onPress={close} />
        <View ref={panel} accessibilityRole="menu" accessibilityLabel={t('createContent')} accessibilityViewIsModal style={{ position: 'absolute', right: anchor.right, bottom: anchor.bottom, gap: theme.spacing[3], alignItems: 'flex-end', maxWidth: width - theme.layout.mobileInset * 2 }}>
          {props.actions.map(({ kind, label, onPress }, index) => {
            const Icon = icons[kind];
            return <Pressable key={kind} ref={index === 0 ? initial : undefined} accessibilityRole="menuitem" accessibilityLabel={label} onPress={() => { close(); requestAnimationFrame(onPress); }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', minHeight: theme.controlSizes.primary, paddingHorizontal: theme.spacing[6], paddingVertical: theme.spacing[3], gap: theme.spacing[3], backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface, borderRadius: theme.borderRadii.full, boxShadow: theme.shadow.soft })}>
              <Icon color={theme.colors.inkMuted} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} /><Text variant="button" color="ink">{label}</Text>
            </Pressable>;
          })}
          <Pressable accessibilityRole="menuitem" accessibilityLabel={t('createMenuClose')} onPress={close} style={buttonStyle}><X size={theme.spacing[6] + theme.spacing[1]} color={theme.colors.surface} strokeWidth={theme.focus.width} /></Pressable>
        </View>
      </View>
    </Modal> : null}
  </>;
}
