import { Pressable, View } from 'react-native';
import { useTheme } from '@shopify/restyle';
import { useTranslation } from '../../i18n';
import type { Theme } from '../../ui/theme';

interface LabelColorChoicesProps {
  colors: string[];
  value: string;
  onChange(color: string): void;
  disabled?: boolean;
  /** A wide pane shows each colour as a full swatch and rings the chosen one; otherwise small dots sit in outlined targets. */
  wide?: boolean;
  /** A fine pointer needs no 44px target: dots sit in desktop-control rings, the chosen one outlined. */
  dense?: boolean;
}

/** The colours a label can take, as one radio group; used where labels are created or edited. */
export function LabelColorChoices({ colors, value, onChange, disabled = false, wide = false, dense = false }: LabelColorChoicesProps) {
  const { t } = useTranslation('labels');
  const theme = useTheme<Theme>();
  const swatch = theme.controlSizes.touchTarget - theme.spacing[3];
  const target = dense ? theme.layout.desktopControl : theme.controlSizes.touchTarget;
  const dot = wide ? swatch : theme.controlSizes.icon;
  const ring = wide || dense;
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('colorGroup')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[2] }}>
      {colors.map(color => (
        <Pressable
          key={color}
          accessibilityRole="radio"
          accessibilityLabel={t('chooseColor', { color })}
          accessibilityState={{ checked: value === color, disabled }}
          aria-checked={value === color}
          disabled={disabled}
          onPress={() => onChange(color)}
          style={{ minWidth: target, minHeight: target, alignItems: 'center', justifyContent: 'center', borderRadius: theme.borderRadii.full, borderWidth: ring ? theme.borderWidths.focus : theme.borderWidths.default, borderColor: value === color ? theme.colors.ink : ring ? theme.colors.transparent : theme.colors.separator }}
        >
          <View style={{ width: dot, height: dot, borderRadius: theme.borderRadii.full, backgroundColor: color }} />
        </Pressable>
      ))}
    </View>
  );
}
