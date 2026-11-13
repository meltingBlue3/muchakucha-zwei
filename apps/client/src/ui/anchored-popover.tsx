import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { Portal } from '../platform/layout/portal';
import { useOverlayFocus } from '../platform/overlays/overlay-focus';
import { theme } from './theme';
import { Heading, IconButton, Inline } from './primitives';
import X from 'lucide-react-native/icons/x';
import { useTranslation } from '../i18n';

export function AnchoredPopover({ title, trigger, onClose, children, width = theme.layout.desktopSwitcherWidth, scrollable = false, busy = false }: {
  title: string; trigger: RefObject<View | null>; onClose(): void; children: ReactNode; width?: number;
  scrollable?: boolean; busy?: boolean;
}) {
  const { t } = useTranslation('common');
  const panel = useRef<View>(null);
  const initial = useRef<View>(null);
  const viewport = useWindowDimensions();
  const [anchor, setAnchor] = useState<{ left: number; top?: number; bottom?: number; room: number } | null>(null);
  useLayoutEffect(() => {
    // Below the trigger when it sits in the upper half, above it otherwise; either way no taller than the room on that side.
    trigger.current?.measureInWindow((x, y, _w, h) => setAnchor({ left: Math.min(Math.max(theme.spacing[2], x), viewport.width - width - theme.spacing[2]), ...(y > viewport.height / 2 ? { bottom: viewport.height - y + theme.spacing[2], room: y - theme.spacing[2] * 2 } : { top: y + h + theme.spacing[2], room: viewport.height - y - h - theme.spacing[2] * 2 }) }));
  }, [trigger, viewport.width, viewport.height, width]);
  useOverlayFocus({ mode: anchor ? 'dialog' : 'closed', panel, initial, trigger, onClose });
  // The layer fills the window, so `bottom` is measured from the window's foot and the dismiss layer covers everything.
  return <Portal><View pointerEvents="box-none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
    <Pressable accessible={false} tabIndex={-1} onPress={onClose} style={{ position: 'absolute', inset: 0 }} />
    {anchor ? <View ref={panel} role="dialog" accessibilityLabel={title} testID="app-dialog-panel" style={{ position: 'absolute', left: anchor.left, ...(anchor.top === undefined ? { bottom: anchor.bottom } : { top: anchor.top }), width, maxHeight: Math.min(theme.layout.switcherMaxHeight, viewport.height - theme.spacing[16], anchor.room), backgroundColor: theme.colors.surface, borderWidth: theme.borderWidths.default, borderColor: theme.colors.separator, borderRadius: theme.borderRadii.md, padding: theme.spacing[4], boxShadow: theme.shadow.raised, gap: theme.spacing[3] }}><Inline><Heading ref={initial} tabIndex={-1} variant="label" style={{ flex: 1 }}>{title}</Heading><IconButton disabled={busy} label={t('close', { title })} appearance="plain" icon={<X size={theme.controlSizes.icon} color={theme.colors.inkMuted} />} onPress={onClose} /></Inline>{scrollable ? <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">{children}</ScrollView> : children}</View> : null}
  </View></Portal>;
}
