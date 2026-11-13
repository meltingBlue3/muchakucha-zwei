import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { Text } from './primitives';
import Search from 'lucide-react-native/icons/search';
import X from 'lucide-react-native/icons/x';
import { theme } from './theme';
import { useDesktopDensity } from './use-desktop';
import { useTranslation } from '../i18n';

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
  const { t } = useTranslation('shared');
  const [focused, setFocused] = useState(false);
  const dense = useDesktopDensity();
  const input = useRef<TextInput>(null);
  // On a desktop, / jumps to the page's search unless the person is already typing somewhere.
  useEffect(() => {
    if (!dense || Platform.OS !== 'web') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
      event.preventDefault();
      input.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dense]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: dense ? theme.layout.desktopControl : theme.controlSizes.field - theme.spacing[1], ...(dense ? { width: theme.layout.desktopSearchWidth, maxWidth: '100%', paddingRight: theme.spacing[2] } : {}), borderRadius: dense ? theme.borderRadii.sm : theme.borderRadii.md, backgroundColor: focused ? theme.colors.surface : dense ? theme.colors.canvas : theme.colors.surfaceMuted, borderWidth: theme.borderWidths.default, borderColor: focused ? theme.colors.ink : theme.colors.transparent, paddingLeft: dense ? theme.spacing[2] + 2 : theme.spacing[3] }}>
      <Search size={dense ? theme.controlSizes.icon - 5 : theme.controlSizes.icon - theme.spacing[1]} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />
      <TextInput
        ref={input}
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
        style={{ flex: 1, minWidth: 0, alignSelf: 'stretch', color: theme.colors.ink, fontFamily: theme.fontFamilies.regular, fontSize: dense ? theme.typography.meta.fontSize : theme.typography.body.fontSize, paddingHorizontal: theme.spacing[2], outlineStyle: 'none' } as never}
      />
      {value !== '' ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t('searchClear')} onPress={() => onChangeText('')} style={{ minWidth: dense ? theme.layout.desktopControl : theme.controlSizes.touchTarget, minHeight: dense ? theme.layout.desktopControl : theme.controlSizes.touchTarget - theme.spacing[1], alignItems: 'center', justifyContent: 'center' }}>
          <X size={theme.controlSizes.icon - theme.spacing[1]} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />
        </Pressable>
      ) : dense && !focused ? <View accessible={false} style={{ borderWidth: theme.borderWidths.default, borderColor: theme.colors.outline, borderRadius: theme.spacing[1], paddingHorizontal: theme.spacing[1] + 1 }}><Text variant="caption" color="inkFaint" style={{ fontFamily: theme.fontFamilies.numeric, fontSize: theme.typography.tag.fontSize - 0.5, lineHeight: theme.spacing[4] }}>/</Text></View> : null}
    </View>
  );
}
