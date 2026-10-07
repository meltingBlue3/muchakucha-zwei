import { View } from 'react-native';
import { Text } from './primitives';
import { memberColors, theme } from './theme';

type AvatarSize = 'sm' | 'md' | 'lg';

const SIZE: Record<AvatarSize, number> = {
  sm: theme.controlSizes.avatarSm,
  md: theme.controlSizes.avatar,
  lg: theme.controlSizes.avatarLg,
};

/** The same person keeps the same color on every screen and device. */
export function memberColor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return memberColors[hash % memberColors.length]!;
}

/** First character of a display name, counting a CJK character or emoji as one. */
export function memberInitial(name: string): string {
  return [...name.trim().normalize('NFC')][0] ?? '?';
}

/**
 * A family member as a colored circle with their initial. Decorative by
 * default: the surrounding text or the group label names the person.
 */
export function MemberAvatar({ id, name, size = 'md', ring = false }: {
  id: string;
  name: string;
  size?: AvatarSize;
  /** A surface-colored ring separates overlapping avatars in a stack. */
  ring?: boolean;
}) {
  const diameter = SIZE[size];
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{
        width: diameter,
        height: diameter,
        borderRadius: theme.borderRadii.full,
        backgroundColor: memberColor(id),
        alignItems: 'center',
        justifyContent: 'center',
        ...(ring ? { borderWidth: theme.borderWidths.focus, borderColor: theme.colors.surface } : {}),
      }}
    >
      <Text
        variant={size === 'lg' ? 'section' : 'caption'}
        color="surface"
        allowFontScaling={false}
        style={{ fontWeight: '600' }}
      >
        {memberInitial(name)}
      </Text>
    </View>
  );
}

/**
 * Who an item belongs to, as overlapping avatars. Announced once as
 * "负责人：小林、妈妈" so the circles never need to be read one by one.
 */
export function AvatarStack({ members, max = 3, label = '负责人' }: {
  members: Array<{ id: string; name: string }>;
  max?: number;
  label?: string;
}) {
  if (members.length === 0) return null;
  const shown = members.slice(0, max);
  const hidden = members.length - shown.length;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${label}：${members.map(member => member.name).join('、')}`}
      style={{ flexDirection: 'row', alignItems: 'center' }}
    >
      {shown.map((member, index) => (
        <View key={member.id} style={{ marginLeft: index === 0 ? 0 : -theme.spacing[2] }}>
          <MemberAvatar id={member.id} name={member.name} size="sm" ring />
        </View>
      ))}
      {hidden > 0 ? <Text variant="caption" style={{ marginLeft: theme.spacing[1] }}>+{hidden}</Text> : null}
    </View>
  );
}
