import { Children, isValidElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { Heading, Inline, Stack, Text } from './primitives';
import { theme } from './theme';

/** One white panel of a settings page: an icon and title, then its rows. */
export function SettingsSection({ title, icon, detail, action, children }: {
  title: string;
  icon: ReactNode;
  detail?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Stack gap={4} style={{ backgroundColor: theme.colors.surface, borderRadius: theme.borderRadii.lg, padding: theme.spacing[5] }}>
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
