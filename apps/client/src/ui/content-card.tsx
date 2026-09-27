import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { theme } from './theme';

/**
 * The one card shape for events, tasks and notes: a quiet surface whose body
 * opens the item, with room for a leading control (a task's completion mark),
 * a trailing menu, and feedback beneath. The body and the controls are
 * siblings, never nested, so Web never gets a button inside a button.
 */
export function ContentCard({ accessibilityLabel, onPress, leading, trailing, footer, children }: {
  accessibilityLabel: string;
  onPress(): void;
  leading?: ReactNode;
  trailing?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.borderRadii.xl, borderWidth: theme.borderWidths.default, borderColor: theme.colors.separator, padding: theme.spacing[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        {leading}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPress={onPress}
          style={({ pressed }) => ({ flex: 1, minWidth: 0, padding: theme.spacing[2], borderRadius: theme.borderRadii.md, backgroundColor: pressed ? theme.colors.surfaceSubtle : theme.colors.transparent })}
        >
          {children}
        </Pressable>
        {trailing}
      </View>
      {footer}
    </View>
  );
}
