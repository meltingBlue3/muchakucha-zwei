import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { Portal } from '../platform/layout/portal';
import { useOverlayFocus } from '../platform/overlays/overlay-focus';
import { theme } from './theme';
import { Heading, IconButton, Inline } from './primitives';
import X from 'lucide-react-native/icons/x';
import { useTranslation } from '../i18n';

const ParentPopover = createContext<RefObject<View | null> | null>(null);

export function AnchoredPopover({ title, trigger, onClose, children, width = theme.layout.desktopSwitcherWidth, maxHeight = theme.layout.switcherMaxHeight, align = 'start', scrollable = false, busy = false, footer }: {
  title: string; trigger: RefObject<View | null>; onClose(): void; children: ReactNode;
  width?: number; maxHeight?: number; align?: 'start' | 'end'; footer?: ReactNode;
  scrollable?: boolean; busy?: boolean;
}) {
  const { t } = useTranslation('common');
  const parent = useContext(ParentPopover);
  const panel = useRef<View>(null);
  const initial = useRef<View>(null);
  const viewport = useWindowDimensions();
  const [anchor, setAnchor] = useState<{ left: number; top?: number; bottom?: number; room: number } | null>(null);
  useLayoutEffect(() => {
    // Below the trigger when it sits in the upper half, above it otherwise; either way no taller than the room on that side.
    trigger.current?.measureInWindow((x, y, w, h) => {
      const left = align === 'end' ? x + w - width : x;
      setAnchor({ left: Math.min(Math.max(theme.spacing[2], left), viewport.width - width - theme.spacing[2]), ...(y > viewport.height / 2 ? { bottom: viewport.height - y + theme.spacing[2], room: y - theme.spacing[2] * 2 } : { top: y + h + theme.spacing[2], room: viewport.height - y - h - theme.spacing[2] * 2 }) });
    });
  }, [align, trigger, viewport.width, viewport.height, width]);
  const open = anchor !== null;
  useLayoutEffect(() => {
    if (!open || Platform.OS !== 'web') return;
    const parentPanel = parent?.current as unknown as HTMLElement | null | undefined;
    if (!parentPanel) return;
    // Nested popovers have their own portal. Keep the covered card out of the focus order and accessibility tree.
    parentPanel.inert = true;
    parentPanel.setAttribute('aria-hidden', 'true');
    return () => {
      parentPanel.inert = false;
      parentPanel.removeAttribute('aria-hidden');
    };
  }, [open, parent]);
  useOverlayFocus({ mode: open ? 'dialog' : 'closed', panel, initial, trigger, onClose });
  // The layer fills the window, so `bottom` is measured from the window's foot and the dismiss layer covers everything.
  return <Portal><View pointerEvents="box-none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
    <Pressable accessible={false} tabIndex={-1} onPress={onClose} style={{ position: 'absolute', inset: 0 }} />
    {anchor ? <View ref={panel} role="dialog" accessibilityLabel={title} testID="app-dialog-panel" style={{ position: 'absolute', left: anchor.left, ...(anchor.top === undefined ? { bottom: anchor.bottom } : { top: anchor.top }), width, maxHeight: Math.min(maxHeight, viewport.height - theme.spacing[16], anchor.room), backgroundColor: theme.colors.surface, borderWidth: theme.borderWidths.default, borderColor: theme.colors.separator, borderRadius: theme.borderRadii.md, padding: theme.spacing[4], boxShadow: theme.shadow.raised, gap: theme.spacing[3] }}>
      <Inline>
        <Heading ref={initial} tabIndex={-1} variant="label" style={{ flex: 1 }}>{title}</Heading>
        <IconButton disabled={busy} label={t('close', { title })} appearance="plain" icon={<X size={theme.controlSizes.icon} color={theme.colors.inkMuted} />} onPress={onClose} />
      </Inline>
      <ParentPopover.Provider value={panel}>
        {scrollable ? <ScrollView style={{ flexShrink: 1, minHeight: 0 }} keyboardShouldPersistTaps="handled">{children}</ScrollView> : children}
        {footer ? <View style={{ borderTopWidth: theme.borderWidths.default, borderTopColor: theme.colors.separator }}>{footer}</View> : null}
      </ParentPopover.Provider>
    </View> : null}
  </View></Portal>;
}
