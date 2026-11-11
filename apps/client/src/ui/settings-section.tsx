import { Children, isValidElement, type ReactNode } from 'react';
import { Switch, View } from 'react-native';
import { Heading, Inline, Stack, Text } from './primitives';
import { theme } from './theme';
import { useDesktop } from './use-desktop';

/** One white panel of a settings page: an icon and title, then its rows. */
export function SettingsSection({ title, icon, detail, count, action, children, plain = false }: {
  title: string;
  icon: ReactNode;
  detail?: string;
  /** Desktop: a number printed after the title, as in 「成员 4」. */
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  /** Desktop: no panel, as a table section in the page's main column. */
  plain?: boolean;
}) {
  const desktop = useDesktop();
  if (desktop) {
    return (
      <Stack gap={plain ? 2 : 3} style={plain ? undefined : { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadii.md, borderWidth: theme.borderWidths.default, borderColor: theme.colors.separator, paddingHorizontal: theme.spacing[5], paddingVertical: theme.spacing[4] }}>
        <Inline gap={2}>
          <Heading variant="label" style={plain ? { fontSize: theme.typography.button.fontSize } : undefined}>{title}</Heading>
          {count !== undefined ? <Text variant="meta" style={{ fontFamily: theme.fontFamilies.numeric }}>{count}</Text> : null}
          <View style={{ flex: 1 }} />
          {action}
        </Inline>
        {detail && count === undefined ? <Text variant="meta" style={{ marginTop: -theme.spacing[2] }}>{detail}</Text> : null}
        {children}
      </Stack>
    );
  }
  return (
    <Stack gap={4} style={{ backgroundColor: theme.colors.surface, borderRadius: theme.borderRadii.lg, padding: theme.spacing[5], ...(desktop ? { borderWidth: theme.borderWidths.default, borderColor: theme.colors.separator } : {}) }}>
      <Inline gap={3}>
        {icon}
        <Stack gap={0} style={{ flex: 1 }}>
          <Heading variant="section">{title}</Heading>
          {detail ? <Text variant="meta">{detail}</Text> : null}
        </Stack>
        {action}
      </Inline>
      {children}
    </Stack>
  );
}

/** The rows of a settings panel, with hairlines between them and none after the last. */
export function SettingsRows({ children }: { children: ReactNode }) {
  return <View>
    {Children.toArray(children).filter(isValidElement).map((row, index) => <View key={row.key ?? index} style={index > 0 ? { borderTopWidth: theme.borderWidths.default, borderTopColor: theme.colors.separator } : undefined}>{row}</View>)}
  </View>;
}

/** A switch as a row; `name` is its accessible name when the label alone would not say what it switches. */
export function SwitchRow({ label, name = label, value, disabled, onChange, children }: { label: string; name?: string; value: boolean; disabled: boolean; onChange(value: boolean): void; children?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3], minHeight: theme.controlSizes.touchTarget, paddingVertical: theme.spacing[2] }}>
      <View style={{ flex: 1 }}>
        <Text>{label}</Text>
        {children}
      </View>
      <Switch
        accessibilityLabel={name}
        disabled={disabled}
        value={value}
        onValueChange={onChange}
        // As in the event form: a neutral track when off, ink when on, a white thumb.
        trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
        thumbColor={theme.colors.surface}
        ios_backgroundColor={theme.colors.border}
      />
    </View>
  );
}
