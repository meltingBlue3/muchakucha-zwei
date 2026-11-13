import { createContext, useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { DialogBackdrop } from './dialog-backdrop';
import { Modal, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import X from 'lucide-react-native/icons/x';
import { useOverlayFocus } from '../platform/overlays/overlay-focus';
import { KeyboardArea, scrollKeyboardDismissMode } from './keyboard-area';
import { Button, Heading, Inline, Text } from './primitives';

/** Kept for screen readers and focus, out of sight. */
const visuallyHidden = { position: 'absolute' as const, width: 1, height: 1, overflow: 'hidden' as const, opacity: 0 };
import { SheetActionSlot, type SheetAction } from './sheet-action';
import { theme } from './theme';
import { desktopDetailWidth, todayNotePaneWidth, useDesktop } from './use-desktop';
import { layoutTransition, usePaneEntrance } from './motion';
import { AnchoredPopover } from './anchored-popover';
import { holdsCommandKey, useCommandKeyLabel } from './command-key';
import { useSidebarRail } from './sidebar-rail';

/** True inside the wide reading pane beside the notes list, where a note is set in reading type. */
export const ReadingPane = createContext(false);

// React Native Web always renders Modal as a role="dialog" node, so on web that node carries
// the dialog name and the panel stays a plain container to avoid nested dialogs.
function webDialogName(title: string): object {
  return Platform.OS === 'web' ? { 'aria-label': title } : {};
}

export function AppDialog({ title, busy, onClose, trigger, children, size = 'standard', docked = false, footer, headerActions, headerNote, reading = false, anchored = false, wide = false, fillContent = false }: {
  title: string;
  busy: boolean;
  onClose(): void;
  trigger: RefObject<View | null>;
  children: ReactNode;
  size?: 'standard' | 'editor' | 'sheet';
  /**
   * Desktop web presents a nonmodal resource pane below the workspace header.
   * Its steps and confirmations stay there. Native wide windows retain their
   * existing docked modal presentation.
   */
  docked?: boolean;
  footer?: ReactNode;
  headerActions?: ReactNode;
  /** Desktop pane only: shown in the header in place of the title, which stays as the pane's (visually hidden) heading. */
  headerNote?: string;
  reading?: boolean;
  anchored?: boolean;
  /** Desktop pane only: as wide as Today's 待办 and 接下来 together, for a note written beside Today. */
  wide?: boolean;
  /** The content fills the viewport and handles its own scrolling. */
  fillContent?: boolean;
}) {
  const panel = useRef<View>(null);
  const initial = useRef<View>(null);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const side = docked && width >= theme.layout.navigationBreakpoint;
  const desktop = useDesktop();
  const { rail } = useSidebarRail();
  const pane = desktop && docked;
  const popover = desktop && anchored;
  // On phones an editor fills the screen like a native compose sheet: close on
  // the left, the form's primary action on the right.
  const sheet = size === 'editor' && width < theme.layout.editorSheetBreakpoint;
  const bottomSheet = size === 'sheet' && width < theme.layout.editorSheetBreakpoint;
  const [sheetAction, setSheetAction] = useState<SheetAction | null>(null);
  const close = useCallback(() => { if (!busy) onClose(); }, [busy, onClose]);
  const focus = useOverlayFocus({ mode: popover ? 'closed' : pane ? 'pane' : 'dialog', panel, initial, trigger, onClose: close });
  const previousTitle = useRef(title);
  // A dialog can replace its content with a confirmation step. Focus its safe
  // close action again; the element that opened that step may no longer exist.
  useEffect(() => {
    const changed = previousTitle.current !== title;
    previousTitle.current = title;
    if ((!pane && !popover) || (pane && changed)) focus();
  }, [title, focus, pane, popover]);
  const commandKey = useCommandKeyLabel();
  const entrance = usePaneEntrance(pane);
  // In a desktop pane, Ctrl+Enter (⌘+Enter on a Mac) submits the form from anywhere inside it.
  // Listened for while capturing: React Native Web's text fields stop key events from bubbling.
  useEffect(() => {
    if (!pane || !sheetAction || Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || !holdsCommandKey(event) || event.isComposing) return;
      const node = panel.current as unknown as HTMLElement | null;
      if (!node || !(event.target instanceof Node) || !node.contains(event.target)) return;
      event.preventDefault();
      if (!sheetAction.submitting && !sheetAction.disabled) sheetAction.onPress();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [pane, sheetAction]);
  if (popover) return <AnchoredPopover scrollable title={title} trigger={trigger} onClose={close} busy={busy}>{children}{footer}</AnchoredPopover>;
  if (pane) {
    const sidebar = rail ? theme.layout.railWidth : theme.layout.navigationWidth;
    return <View role="region" accessibilityLabel={title} pointerEvents="box-none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}><View ref={panel} testID="app-dialog-panel" style={{ position: 'absolute', pointerEvents: 'auto', right: theme.layout.workspaceInset + theme.borderWidths.default, top: theme.layout.workspaceInset + theme.layout.pageHeaderHeight + theme.borderWidths.default, bottom: theme.layout.workspaceInset + theme.borderWidths.default, ...(reading ? { left: sidebar + theme.layout.notesListWidth + theme.borderWidths.default } : { width: wide ? todayNotePaneWidth(width, rail) : desktopDetailWidth(width) }), backgroundColor: theme.colors.surface, borderLeftWidth: theme.borderWidths.default, borderLeftColor: theme.colors.separator, borderBottomRightRadius: theme.layout.workspaceRadius, overflow: 'hidden', ...entrance }}>
      <Inline gap={1} style={{ height: theme.layout.paneHeaderHeight, paddingLeft: theme.spacing[6], paddingRight: theme.spacing[2] + 2, borderBottomWidth: theme.borderWidths.default, borderBottomColor: theme.colors.separator }}>
        {/* A form names itself in the header; a detail keeps the header quiet, since its title follows in large type. */}
        <Heading ref={initial} tabIndex={-1} variant={sheetAction ? 'label' : 'meta'} color={sheetAction ? 'ink' : 'inkFaint'} level={2} numberOfLines={1} style={headerNote ? visuallyHidden : { flex: 1 }}>{title}</Heading>
        {headerNote ? <Text variant="meta" color="inkFaint" numberOfLines={1} style={{ flex: 1, fontFamily: theme.fontFamilies.numeric }}>{headerNote}</Text> : null}
        {headerActions}
        {reading && sheetAction ? <><Button label="取消" tone="secondary" disabled={sheetAction.submitting} onPress={() => sheetAction.onCancel?.()} /><Button label={sheetAction.label} loading={sheetAction.submitting} disabled={sheetAction.disabled ?? false} onPress={sheetAction.onPress} /></> : null}
        {/* Round and filled, in ink, so it reads as the way out. */}
        <Pressable accessibilityRole="button" accessibilityLabel={`关闭${title}`} disabled={busy} accessibilityState={{ disabled: busy }} onPress={close} style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ width: theme.layout.desktopControl, height: theme.layout.desktopControl, marginLeft: theme.spacing[1], borderRadius: theme.borderRadii.full, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? theme.colors.surfaceSelected : hovered ? theme.colors.surfaceSelected : theme.colors.surfaceMuted, ...layoutTransition('background-color') })}><X size={theme.controlSizes.icon - 4} color={theme.colors.ink} strokeWidth={theme.focus.width} /></Pressable>
      </Inline>
      {reading && footer ? <View style={{ paddingVertical: theme.spacing[2], paddingHorizontal: fillContent ? theme.spacing[6] : theme.spacing[2], borderBottomWidth: theme.borderWidths.default, borderBottomColor: theme.colors.separator }}>{footer}</View> : null}
      <ReadingPane.Provider value={reading}><SheetActionSlot.Provider value={setSheetAction}>
        <ScrollView
          tabIndex={fillContent ? -1 : 0}
          style={{ flex: 1, minHeight: 0 }}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!fillContent}
          contentContainerStyle={[
            { paddingVertical: theme.spacing[5], paddingHorizontal: theme.spacing[6] },
            fillContent ? { flex: 1 } : undefined,
            reading && !fillContent ? { width: '100%', maxWidth: theme.layout.readingWidth + theme.spacing[6] * 2, alignSelf: 'center' } : undefined,
          ]}
        >{children}</ScrollView>
      </SheetActionSlot.Provider></ReadingPane.Provider>
      {!reading && (footer || sheetAction) ? <View style={{ padding: theme.spacing[4], borderTopWidth: theme.borderWidths.default, borderTopColor: theme.colors.separator }}>{footer}{sheetAction ? <Inline style={{ justifyContent: 'flex-end' }}><Text variant="meta" color="inkFaint" numberOfLines={1} style={{ flex: 1, paddingLeft: theme.spacing[2], fontFamily: theme.fontFamilies.numeric }}>{`${commandKey} + Enter ${sheetAction.label}`}</Text><Button label="取消" tone="secondary" disabled={sheetAction.submitting} onPress={() => sheetAction.onCancel?.()} /><Button label={sheetAction.label} loading={sheetAction.submitting} disabled={sheetAction.disabled ?? false} onPress={sheetAction.onPress} /></Inline> : null}</View> : null}
    </View></View>;
  }
  const closeButton = (
    <Pressable ref={initial} accessibilityRole="button" accessibilityLabel={`关闭${title}`} disabled={busy} accessibilityState={{ disabled: busy }} onPress={close} style={({ pressed }) => ({ minWidth: theme.controlSizes.touchTarget, minHeight: theme.controlSizes.touchTarget, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.transparent, borderRadius: theme.borderRadii.full })}>
      <X size={sheet ? theme.controlSizes.icon + theme.spacing[1] : theme.controlSizes.icon} color={sheet ? theme.colors.ink : theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />
    </Pressable>
  );
  return (
    <Modal {...webDialogName(title)} transparent visible animationType="none" onShow={focus} onRequestClose={Platform.OS === 'web' ? undefined : close} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1 }}>
        <DialogBackdrop onPress={close} blur={!side} />
        <KeyboardArea pointerEvents="box-none" style={side
          ? { flex: 1, alignItems: 'flex-end', padding: theme.spacing[3], paddingTop: insets.top + theme.spacing[3], paddingBottom: insets.bottom + theme.spacing[3] }
          : bottomSheet
          ? { flex: 1, justifyContent: 'flex-end', paddingTop: insets.top + theme.spacing[6] }
          : sheet
          ? { flex: 1, justifyContent: 'flex-end', paddingTop: insets.top + theme.spacing[2] }
          : { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.spacing[5], paddingTop: insets.top + theme.spacing[5], paddingBottom: insets.bottom + theme.spacing[5] }}>
          <View ref={panel} testID="app-dialog-panel" {...(Platform.OS === 'web' ? {} : { accessibilityViewIsModal: true, accessibilityLabel: title })} style={side
            ? { width: theme.layout.dockedPanelWidth, maxWidth: '100%', height: '100%', backgroundColor: theme.colors.surface, borderRadius: theme.borderRadii.xl, padding: theme.spacing[6], gap: theme.spacing[4], ...(Platform.OS === 'web' ? { boxShadow: theme.shadow.raised } : {}) }
            : bottomSheet
            ? { width: '100%', maxHeight: '100%', backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.borderRadii.xl, borderTopRightRadius: theme.borderRadii.xl, padding: theme.spacing[5], paddingBottom: insets.bottom + theme.spacing[5], gap: theme.spacing[4] }
            : sheet
            ? { flex: 1, width: '100%', backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.borderRadii.xl, borderTopRightRadius: theme.borderRadii.xl, paddingTop: theme.spacing[2], paddingHorizontal: theme.spacing[2], paddingBottom: insets.bottom + theme.spacing[2], gap: theme.spacing[2] }
            : { width: '100%', maxWidth: size === 'editor' ? theme.layout.editorDialogMaxWidth : theme.layout.dialogMaxWidth, height: fillContent ? '100%' : undefined, maxHeight: '100%', backgroundColor: theme.colors.surface, borderRadius: theme.borderRadii.xl, padding: theme.spacing[6], gap: theme.spacing[4], ...(Platform.OS === 'web' ? { boxShadow: theme.shadow.raised } : {}) }}>
            {sheet ? (
              <Inline gap={1} style={{ paddingRight: theme.spacing[2] }}>
                {closeButton}
                <Heading variant="section" level={1} numberOfLines={1} style={{ flex: 1 }}>{title}</Heading>
                {headerActions}
                {sheetAction ? <Button label={sheetAction.label} loading={sheetAction.submitting} disabled={sheetAction.disabled ?? false} onPress={sheetAction.onPress} style={{ minHeight: theme.controlSizes.touchTarget, borderRadius: theme.borderRadii.full, paddingHorizontal: theme.spacing[5] }} /> : null}
              </Inline>
            ) : (
              <Inline>
                <Heading style={{ flex: 1 }}>{title}</Heading>
                {headerActions}
                {closeButton}
              </Inline>
            )}
            <SheetActionSlot.Provider value={sheet ? setSheetAction : null}>
              <ScrollView
                {...(Platform.OS === 'web' && size === 'editor' ? { tabIndex: fillContent ? -1 : 0 } : {})}
                keyboardDismissMode={scrollKeyboardDismissMode}
                keyboardShouldPersistTaps="handled"
                scrollEnabled={!fillContent}
                scrollsChildToFocus={!fillContent}
                style={side || fillContent ? { flex: 1 } : { flexShrink: 1 }}
                contentContainerStyle={[
                  sheet ? { paddingHorizontal: theme.spacing[3], paddingBottom: fillContent ? 0 : theme.spacing[6] } : undefined,
                  fillContent ? { flex: 1 } : undefined,
                ]}
              >{children}</ScrollView>
            </SheetActionSlot.Provider>
            {footer ? <View style={{ borderTopWidth: theme.borderWidths.default, borderTopColor: theme.colors.separator, paddingTop: theme.spacing[4], ...(sheet ? { paddingHorizontal: theme.spacing[3] } : {}) }}>{footer}</View> : null}
          </View>
        </KeyboardArea>
      </View>
    </Modal>
  );
}
