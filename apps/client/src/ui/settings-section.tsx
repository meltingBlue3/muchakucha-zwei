import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Heading, Inline, Stack, Text } from './primitives';
import { theme } from './theme';

export function SettingsSection({ title, icon, detail, action, children }: {
  title: string;
  icon: ReactNode;
  detail?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Stack gap={4} style={{ backgroundColor: theme.colors.surface, borderRadius: theme.borderRadii.xl, borderWidth: theme.borderWidths.default, borderColor: theme.colors.separator, padding: theme.spacing[4] }}>
      <Inline gap={3}>
        <View style={{ backgroundColor: theme.colors.surfaceSubtle, borderRadius: theme.borderRadii.md, padding: theme.spacing[2] }}>{icon}</View>
        <Stack gap={0} style={{ flex: 1 }}>
          <Heading variant="section">{title}</Heading>
          {detail ? <Text variant="caption">{detail}</Text> : null}
        </Stack>
        {action}
      </Inline>
      {children}
    </Stack>
  );
}
