import { useCallback, useContext, useRef, type ReactNode, type RefObject } from 'react';
import { BlurView } from 'expo-blur';
import { DialogBackground } from './dialog-background';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import X from 'lucide-react-native/icons/x';
import { useOverlayFocus } from '../platform/overlays/overlay-focus';
import { Heading, Inline } from './primitives';
import { theme } from './theme';

// React Native Web always renders Modal as a role="dialog" node, so on web that node carries
// the dialog name and the panel stays a plain container to avoid nested dialogs.
function webDialogName(title: string): object {
  return Platform.OS === 'web' ? { 'aria-label': title } : {};
}

export function AppDialog({ title, busy, onClose, trigger, children }: {
  title: string;
  busy: boolean;
  onClose(): void;
  trigger: RefObject<View | null>;
  children: ReactNode;
}) {
  const panel = useRef<View>(null);
  const blurTarget = useContext(DialogBackground);
  const initial = useRef<View>(null);
  const insets = useSafeAreaInsets();
  const close = useCallback(() => { if (!busy) onClose(); }, [busy, onClose]);
  const focus = useOverlayFocus({ mode: 'dialog', panel, initial, trigger, onClose: close });
  return (
    <Modal {...webDialogName(title)} transparent visible animationType="none" onShow={focus} onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1 }}>
        <BlurView testID="app-dialog-blur" pointerEvents="none" {...(blurTarget ? { blurTarget } : {})} blurMethod="dimezisBlurView" intensity={theme.blur.dialog} tint="light" style={StyleSheet.absoluteFill} />
        <Pressable testID="app-dialog-dismiss" accessible={false} tabIndex={-1} onPress={close} style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.dialogOverlay }]} />
        <KeyboardAvoidingView pointerEvents="box-none" behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.spacing[5], paddingTop: insets.top + theme.spacing[5], paddingBottom: insets.bottom + theme.spacing[5] }}>
          <View ref={panel} testID="app-dialog-panel" {...(Platform.OS === 'web' ? {} : { accessibilityViewIsModal: true, accessibilityLabel: title })} style={{ width: '100%', maxWidth: theme.layout.dialogMaxWidth, maxHeight: '100%', backgroundColor: theme.colors.surface, borderRadius: theme.borderRadii.xl, borderColor: theme.colors.separator, borderWidth: theme.borderWidths.default, padding: theme.spacing[6], gap: theme.spacing[4] }}>
            <Inline>
              <Heading style={{ flex: 1 }}>{title}</Heading>
              <Pressable ref={initial} accessibilityRole="button" accessibilityLabel={`关闭${title}`} disabled={busy} accessibilityState={{ disabled: busy }} onPress={close} style={({ pressed }) => ({ minWidth: theme.controlSizes.touchTarget, minHeight: theme.controlSizes.touchTarget, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surfaceSubtle, borderRadius: theme.borderRadii.full })}>
                <X size={theme.controlSizes.icon} color={theme.colors.inkMuted} />
              </Pressable>
            </Inline>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }}>{children}</ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
