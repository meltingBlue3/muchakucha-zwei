import { Pressable, View } from 'react-native';
import Check from 'lucide-react-native/icons/check';
import Minus from 'lucide-react-native/icons/minus';
import { theme } from './theme';

export type CheckState = 'open' | 'done' | 'void';

/**
 * The round completion mark at the start of a task row. It answers only "is
 * this done?": open is an empty ring, done is filled ink with a check, and
 * void (a cancelled occurrence) is a dash that cannot be pressed. A vermilion
 * ring marks work that is overdue or urgent.
 */
export function CheckCircle({ state, attention = false, accessibilityLabel, disabled = false, busy = false, onPress }: {
  state: CheckState;
  attention?: boolean;
  accessibilityLabel: string;
  disabled?: boolean;
  busy?: boolean;
  onPress(): void;
}) {
  const size = theme.controlSizes.checkbox;
  const done = state === 'done';
  const unavailable = disabled || state === 'void';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: unavailable, busy }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => ({ minWidth: theme.controlSizes.touchTarget, minHeight: theme.controlSizes.touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: theme.borderRadii.full, backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.transparent })}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: theme.borderRadii.full,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: done ? 0 : theme.controlSizes.iconStroke,
          borderColor: state === 'void' ? theme.colors.separator : attention ? theme.colors.accent : theme.colors.border,
          backgroundColor: done ? theme.colors.primary : busy ? theme.colors.surfaceMuted : theme.colors.transparent,
        }}
      >
        {done ? <Check size={size - theme.spacing[2]} color={theme.colors.surface} strokeWidth={theme.focus.width + 1} /> : null}
        {state === 'void' ? <Minus size={size - theme.spacing[2]} color={theme.colors.inkFaint} strokeWidth={theme.focus.width} /> : null}
      </View>
    </Pressable>
  );
}
