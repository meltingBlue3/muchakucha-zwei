import { useCallback, useEffect, useRef } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Text } from './primitives';
import { theme } from './theme';

export interface ActionNoticeProps {
  message: string;
  actionLabel: string;
  actionAccessibilityLabel?: string;
  onAction(): void;
  onDismiss(): void;
  /** The action is being written; both buttons wait for it. */
  busy?: boolean;
}

function NoticeButton({ label, accessibilityLabel, color, disabled, onPress }: { label: string; accessibilityLabel?: string | undefined; color: 'link' | 'inkMuted'; disabled: boolean; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="button"
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
      accessibilityState={{ disabled, busy: disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: theme.controlSizes.touchTarget, minWidth: theme.controlSizes.touchTarget, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing[3], opacity: pressed || disabled ? 0.6 : 1 })}
    >
      <Text variant="label" color={color}>{label}</Text>
    </Pressable>
  );
}

/**
 * Lets a page dismiss its notice after a touch or click anywhere outside it.
 * The page root and the notice observe the capture phase without claiming the
 * gesture, so the tap still reaches whatever it landed on. Dismissal waits for
 * the gesture to end: it may reflow the list, which must not move the target
 * out from under a press that is still in progress.
 */
export function useActionNoticeDismissal(notice: ActionNoticeProps | null | undefined) {
  const inside = useRef(false);
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDismiss = notice?.onDismiss;
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const finishGesture = useCallback(() => {
    if (!pending.current) return;
    pending.current = false;
    // Let the press that just ended run first.
    timer.current = setTimeout(() => { if (!inside.current) onDismissRef.current?.(); }, 0);
  }, []);
  // Capture runs from the page root down to the notice within one dispatch, so
  // by the time the gesture ends we know whether it began inside the notice.
  const pageCapture = useCallback(() => {
    if (onDismissRef.current) {
      inside.current = false;
      pending.current = true;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const end = () => { window.removeEventListener('pointerup', end, true); window.removeEventListener('pointercancel', end, true); finishGesture(); };
        window.addEventListener('pointerup', end, true);
        window.addEventListener('pointercancel', end, true);
      }
    }
    return false;
  }, [finishGesture]);
  const noticeCapture = useCallback(() => { inside.current = true; return false; }, []);
  // Native delivers touch end to every ancestor of the touched view.
  const pageTouchEnd = Platform.OS === 'web' ? undefined : finishGesture;
  return { pageCapture, noticeCapture, pageTouchEnd };
}

/**
 * A notification that floats at the top of the page after an action that can
 * still be taken back, such as completing a task. 忽略 closes it, and so does
 * touching anywhere else on the page or leaving the page.
 */
export function ActionNotice({ message, actionLabel, actionAccessibilityLabel, onAction, onDismiss, busy = false, onTouchCapture }: ActionNoticeProps & { onTouchCapture?: () => boolean }) {
  return (
    <View
      {...(onTouchCapture ? { onStartShouldSetResponderCapture: onTouchCapture } : {})}
      accessibilityLiveRegion="polite"
      role={'status' as never}
      style={{ width: '100%', maxWidth: theme.layout.dialogMaxWidth, flexDirection: 'row', alignItems: 'center', gap: theme.spacing[1], paddingLeft: theme.spacing[4], paddingRight: theme.spacing[1], paddingVertical: theme.spacing[1], backgroundColor: theme.colors.surface, borderRadius: theme.borderRadii.lg, borderWidth: theme.borderWidths.default, borderColor: theme.colors.separator, boxShadow: theme.shadow.soft }}
    >
      <Text variant="bodySm" color="ink" numberOfLines={2} style={{ flex: 1, minWidth: 0 }}>{message}</Text>
      <NoticeButton label="忽略" color="inkMuted" disabled={busy} onPress={onDismiss} />
      <NoticeButton label={actionLabel} accessibilityLabel={actionAccessibilityLabel} color="link" disabled={busy} onPress={onAction} />
    </View>
  );
}
