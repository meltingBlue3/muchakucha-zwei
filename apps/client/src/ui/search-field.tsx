import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import Search from 'lucide-react-native/icons/search';
import X from 'lucide-react-native/icons/x';
import { theme } from './theme';
import { useDesktopDensity } from './use-desktop';

/**
 * A quiet sunken search box with a magnifier. Its name is announced rather
 * than printed above it, since the icon and placeholder already say what it is.
 */
export function SearchField({ label, placeholder, value, onChangeText }: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText(text: string): void;
}) {
  const [focused, setFocused] = useState(false);
  const dense = useDesktopDensity();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: dense ? theme.layout.desktopControl : theme.controlSizes.field - theme.spacing[1], ...(dense ? { width: theme.spacing[16] * 3, maxWidth: '100%' } : {}), borderRadius: dense ? theme.borderRadii.sm : theme.borderRadii.md, backgroundColor: focused ? theme.colors.surface : dense ? theme.colors.canvas : theme.colors.surfaceMuted, borderWidth: theme.borderWidths.default, borderColor: focused ? theme.colors.ink : theme.colors.transparent, paddingLeft: theme.spacing[3] }}>
      <Search size={theme.controlSizes.icon - theme.spacing[1]} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />
      <TextInput
        accessibilityLabel={label}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.inkFaint}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={{ flex: 1, minWidth: 0, alignSelf: 'stretch', color: theme.colors.ink, fontFamily: theme.fontFamilies.regular, fontSize: theme.typography.body.fontSize, paddingHorizontal: theme.spacing[2], outlineStyle: 'none' } as never}
      />
      {value !== '' ? (
        <Pressable accessibilityRole="button" accessibilityLabel="清空搜索" onPress={() => onChangeText('')} style={{ minWidth: dense ? theme.layout.desktopControl : theme.controlSizes.touchTarget, minHeight: dense ? theme.layout.desktopControl : theme.controlSizes.touchTarget - theme.spacing[1], alignItems: 'center', justifyContent: 'center' }}>
          <X size={theme.controlSizes.icon - theme.spacing[1]} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />
        </Pressable>
      ) : null}
    </View>
  );
}
