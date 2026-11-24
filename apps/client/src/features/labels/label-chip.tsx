import { useTranslation } from '../../i18n';
import { Pressable, ScrollView, View } from 'react-native';
import Check from 'lucide-react-native/icons/check';
import { useTheme } from '@shopify/restyle';
import type { LabelResponseDto } from '@muchakucha/api-client';
import type { Theme } from '../../ui/theme';
import { Text } from '../../ui/primitives';
import { labelName } from './label-name';

/** A faint wash of the label's own color for the chip background. */
function tint(hex: string): string {
  return hex + '1F'; // about 12% alpha
}

interface LabelChipProps {
  label: LabelResponseDto;
  small?: boolean;
  /** Set in a picker: unselected chips are plain outlines, selected ones filled and checked. */
  selected?: boolean;
  /** A desktop picker: a 24px chip; a chosen one keeps its dot, takes an ink outline and a check after the name. */
  dense?: boolean;
}

/**
 * A label inside a list row: its color as a dot and its name in quiet text.
 * Rows show at most `max` labels and a count of the rest.
 */
export function LabelTags({ labels, max = 1 }: { labels: LabelResponseDto[]; max?: number }) {
  const { t } = useTranslation('labels');
  const activeTheme = useTheme<Theme>();
  if (labels.length === 0) return null;
  const dot = activeTheme.spacing[2] - activeTheme.spacing[1] / 2;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: activeTheme.spacing[2], flexShrink: 1 }}>
      {labels.slice(0, max).map(label => (
        <View key={label.id} accessible accessibilityRole="image" accessibilityLabel={t('item', { name: labelName(label) })} style={{ flexDirection: 'row', alignItems: 'center', gap: activeTheme.spacing[1], flexShrink: 1 }}>
          <View style={{ width: dot, height: dot, borderRadius: activeTheme.borderRadii.full, backgroundColor: label.color }} />
          <Text variant="meta" numberOfLines={1} style={{ flexShrink: 1 }}>{labelName(label)}</Text>
        </View>
      ))}
      {labels.length > max ? <Text variant="meta" color="inkFaint">+{labels.length - max}</Text> : null}
    </View>
  );
}

/**
 * Labels carry arbitrary member-chosen colors, so the color lives in the dot,
 * wash and outline while the name stays in ink: light presets such as yellow
 * would otherwise be unreadable as text.
 */
export function LabelChip({ label, small = false, selected, dense = false }: LabelChipProps) {
  const { t } = useTranslation('labels');
  const name = labelName(label);
  return <ChipFace name={name} accessibilityLabel={t('item', { name })} color={label.color} small={small} selected={selected} dense={dense} />;
}

/**
 * A chip's face. Without a color it stands for no label in particular, such
 * as 全部 in a filter: no dot, and ink where a label would show its color.
 */
function ChipFace({ name, accessibilityLabel, color, small = false, selected, dense = false }: { name: string; accessibilityLabel: string; color: string | null; small?: boolean; selected?: boolean | undefined; dense?: boolean }) {
  const unselected = selected === false;
  const activeTheme = useTheme<Theme>();
  const dot = small ? activeTheme.spacing[2] : activeTheme.spacing[2] + activeTheme.spacing[1] / 2;
  const tone = color ?? activeTheme.colors.ink;
  if (dense) {
    const denseDot = activeTheme.spacing[1] + 2;
    return (
      <View
        accessibilityLabel={accessibilityLabel}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: activeTheme.spacing[1] + 1,
          height: activeTheme.spacing[6],
          paddingHorizontal: activeTheme.spacing[2] + 2,
          borderRadius: activeTheme.borderRadii.full,
          borderWidth: activeTheme.borderWidths.default,
          borderColor: selected ? activeTheme.colors.ink : activeTheme.colors.border,
          backgroundColor: activeTheme.colors.surface,
        }}
      >
        {color !== null ? <View style={{ width: denseDot, height: denseDot, borderRadius: activeTheme.borderRadii.full, backgroundColor: color }} /> : null}
        <Text variant="meta" color="ink" style={{ fontWeight: selected ? '600' : '400' }}>{name}</Text>
        {selected ? <Check size={activeTheme.spacing[3]} color={activeTheme.colors.ink} strokeWidth={activeTheme.controlSizes.iconStroke} /> : null}
      </View>
    );
  }

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: activeTheme.spacing[1],
        backgroundColor: unselected ? activeTheme.colors.surface : tint(tone),
        borderWidth: activeTheme.borderWidths.default,
        borderColor: unselected ? activeTheme.colors.border : tone,
        borderRadius: activeTheme.borderRadii.full,
        paddingHorizontal: small ? activeTheme.spacing[2] : activeTheme.spacing[3],
        paddingVertical: small ? activeTheme.spacing[1] / 2 : activeTheme.spacing[1],
      }}
    >
      {selected ? (
        <Check size={dot + activeTheme.spacing[1]} color={activeTheme.colors.ink} strokeWidth={activeTheme.controlSizes.iconStroke} />
      ) : color !== null ? (
        <View style={{ width: dot, height: dot, borderRadius: activeTheme.borderRadii.full, backgroundColor: color }} />
      ) : null}
      <Text variant={small ? 'caption' : 'bodySm'} color="ink">
        {name}
      </Text>
    </View>
  );
}

/**
 * One label at a time, or 全部 (`null`): a row of chips that are radio
 * buttons. On a phone the row scrolls sideways; on a wide screen it wraps.
 * Each chip keeps a full touch target around its smaller face.
 */
export function LabelFilter({ name, allLabel, labels, value, onChange, dense, scroll }: {
  /** The group's accessible name, such as 按标签筛选. */
  name: string;
  allLabel: string;
  labels: readonly LabelResponseDto[];
  value: string | null;
  onChange(value: string | null): void;
  dense: boolean;
  scroll: boolean;
}) {
  const activeTheme = useTheme<Theme>();
  const target = dense ? activeTheme.layout.desktopControl : activeTheme.controlSizes.touchTarget;
  const option = (id: string | null, optionName: string, color: string | null) => {
    const checked = value === id;
    return <Pressable key={id ?? ''} accessibilityRole="radio" accessibilityLabel={optionName} accessibilityState={{ checked }} aria-checked={checked}
      onPress={() => onChange(id)}
      style={({ pressed }) => ({ minHeight: target, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <ChipFace name={optionName} accessibilityLabel={optionName} color={color} selected={checked} dense={dense} />
    </Pressable>;
  };
  const chips = [option(null, allLabel, null), ...labels.map(label => option(label.id, labelName(label), label.color))];
  const gap = activeTheme.spacing[2];
  if (scroll) {
    return <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View accessibilityRole="radiogroup" accessibilityLabel={name} style={{ flexDirection: 'row', alignItems: 'center', gap }}>{chips}</View>
    </ScrollView>;
  }
  return <View accessibilityRole="radiogroup" accessibilityLabel={name} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: gap }}>{chips}</View>;
}
