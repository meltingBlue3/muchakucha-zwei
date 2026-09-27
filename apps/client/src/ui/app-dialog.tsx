import { useCallback, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { BlurView } from 'expo-blur';
import { DialogBackground } from './dialog-background';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import X from 'lucide-react-native/icons/x';
import { useOverlayFocus } from '../platform/overlays/overlay-focus';
import { Button, Heading, Inline } from './primitives';
import { SheetActionSlot, type SheetAction } from './sheet-action';
import { theme } from './theme';

// React Native Web always renders Modal as a role="dialog" node, so on web that node carries
// the dialog name and the panel stays a plain container to avoid nested dialogs.
function webDialogName(title: string): object {
  return Platform.OS === 'web' ? { 'aria-label': title } : {};
}

export function AppDialog({ title, busy, onClose, trigger, children, size = 'standard', footer, headerActions }: {
  title: string;
  busy: boolean;
  onClose(): void;
  trigger: RefObject<View | null>;
  children: ReactNode;
  size?: 'standard' | 'editor';
  footer?: ReactNode;
  headerActions?: ReactNode;
}) {
  const panel = useRef<View>(null);
  const blurTarget = useContext(DialogBackground);
  const initial = useRef<View>(null);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // On phones an editor fills the screen like a native compose sheet: close on
  // the left, the form's primary action on the right.
  const sheet = size === 'editor' && width < theme.layout.editorSheetBreakpoint;
  const [sheetAction, setSheetAction] = useState<SheetAction | null>(null);
  const close = useCallback(() => { if (!busy) onClose(); }, [busy, onClose]);
  const focus = useOverlayFocus({ mode: 'dialog', panel, initial, trigger, onClose: close });
  // A dialog can replace its content with a confirmation step. Focus its safe
  // close action again; the element that opened that step may no longer exist.
  useEffect(() => { focus(); }, [title, focus]);
  const closeButton = (
    <Pressable ref={initial} accessibilityRole="button" accessibilityLabel={`关闭${title}`} disabled={busy} accessibilityState={{ disabled: busy }} onPress={close} style={({ pressed }) => ({ minWidth: theme.controlSizes.touchTarget, minHeight: theme.controlSizes.touchTarget, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? theme.colors.surfaceMuted : sheet ? theme.colors.transparent : theme.colors.surfaceSubtle, borderRadius: theme.borderRadii.full })}>
      <X size={sheet ? theme.controlSizes.icon + theme.spacing[1] : theme.controlSizes.icon} color={sheet ? theme.colors.ink : theme.colors.inkMuted} />
    </Pressable>
  );
  return (
    <Modal {...webDialogName(title)} transparent visible animationType="none" onShow={focus} onRequestClose={Platform.OS === 'web' ? undefined : close} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1 }}>
        <BlurView testID="app-dialog-blur" pointerEvents="none" {...(blurTarget ? { blurTarget } : {})} blurMethod="dimezisBlurView" intensity={theme.blur.dialog} tint="light" style={StyleSheet.absoluteFill} />
        <Pressable testID="app-dialog-dismiss" accessible={false} tabIndex={-1} onPress={close} style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.dialogOverlay }]} />
        <KeyboardAvoidingView pointerEvents="box-none" behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={sheet
          ? { flex: 1, justifyContent: 'flex-end', paddingTop: insets.top + theme.spacing[2] }
          : { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.spacing[5], paddingTop: insets.top + theme.spacing[5], paddingBottom: insets.bottom + theme.spacing[5] }}>
          <View ref={panel} testID="app-dialog-panel" {...(Platform.OS === 'web' ? {} : { accessibilityViewIsModal: true, accessibilityLabel: title })} style={sheet
            ? { flex: 1, width: '100%', backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.borderRadii.xl, borderTopRightRadius: theme.borderRadii.xl, paddingTop: theme.spacing[2], paddingHorizontal: theme.spacing[2], paddingBottom: insets.bottom + theme.spacing[2], gap: theme.spacing[2] }
            : { width: '100%', maxWidth: size === 'editor' ? theme.layout.editorDialogMaxWidth : theme.layout.dialogMaxWidth, maxHeight: '100%', backgroundColor: theme.colors.surface, borderRadius: theme.borderRadii.xl, borderColor: theme.colors.separator, borderWidth: theme.borderWidths.default, padding: theme.spacing[6], gap: theme.spacing[4] }}>
            {sheet ? (
              <Inline gap={1} style={{ paddingRight: theme.spacing[2] }}>
                {closeButton}
                <Heading variant="section" numberOfLines={1} style={{ flex: 1 }}>{title}</Heading>
                {headerActions}
                {sheetAction ? <Button label={sheetAction.label} loading={sheetAction.submitting} onPress={sheetAction.onPress} style={{ minHeight: theme.controlSizes.touchTarget, borderRadius: theme.borderRadii.full, paddingHorizontal: theme.spacing[5] }} /> : null}
              </Inline>
            ) : (
              <Inline>
                <Heading style={{ flex: 1 }}>{title}</Heading>
                {headerActions}
                {closeButton}
              </Inline>
            )}
            <SheetActionSlot.Provider value={sheet ? setSheetAction : null}>
              <ScrollView {...(Platform.OS === 'web' && size === 'editor' ? { tabIndex: 0 } : {})} keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }} contentContainerStyle={sheet ? { paddingHorizontal: theme.spacing[3], paddingBottom: theme.spacing[6] } : undefined}>{children}</ScrollView>
            </SheetActionSlot.Provider>
            {footer ? <View style={{ borderTopWidth: theme.borderWidths.default, borderTopColor: theme.colors.separator, paddingTop: theme.spacing[4], ...(sheet ? { paddingHorizontal: theme.spacing[3] } : {}) }}>{footer}</View> : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
