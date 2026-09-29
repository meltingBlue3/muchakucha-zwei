import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Keeps its content above the software keyboard.
 *
 * Android draws edge to edge, and there the system no longer resizes the window
 * for the keyboard (`adjustResize`), so Android pads like iOS instead of leaving
 * it to the window. Web has no software keyboard to avoid.
 *
 * The built-in view measures itself relative to its parent, so `windowOffset` is
 * the distance from the window top to that parent — for example the status bar
 * inset when the parent sits inside a safe area.
 */
export function KeyboardArea({ children, style, windowOffset = 0, pointerEvents }: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  windowOffset?: number;
  pointerEvents?: 'box-none' | 'auto';
}) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'web' ? undefined : 'padding'}
      keyboardVerticalOffset={windowOffset}
      {...(pointerEvents === undefined ? {} : { pointerEvents })}
      style={style}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
