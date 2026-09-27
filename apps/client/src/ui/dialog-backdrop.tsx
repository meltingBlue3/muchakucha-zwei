import { useContext } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { DialogBackground } from './dialog-background';
import { theme } from './theme';

/**
 * The backdrop behind anything that takes over the screen — dialogs, sheets
 * and the create menu: the page blurred and lightly tinted, closing on a tap.
 * Menus anchored to a button stay on a transparent dismiss layer instead.
 */
export function DialogBackdrop({ onPress, testID = 'app-dialog' }: { onPress(): void; testID?: string }) {
  const blurTarget = useContext(DialogBackground);
  return <>
    <BlurView testID={`${testID}-blur`} pointerEvents="none" {...(blurTarget ? { blurTarget } : {})} blurMethod="dimezisBlurView" intensity={theme.blur.dialog} tint="light" style={StyleSheet.absoluteFill} />
    <Pressable testID={`${testID}-dismiss`} accessible={false} tabIndex={-1} onPress={onPress} style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.dialogOverlay }]} />
  </>;
}
